import { ITarget } from "./itarget";
import { IInstruction } from "../instructions/iinstruction";
import { IAirmashEnvironment } from "../airmash/iairmash-environment";
import { BotCharacter } from "../bot-character";
import { Calculations } from "../calculations";
import { Debug } from "../../helper/debug";
import { PlayerInfo } from "../airmash/player-info";
import { Pos } from "../pos";
import { GotoLocationConfig } from "../instructions/goto-location-config";
import { GotoLocationInstruction } from "../instructions/goto-location";
import { FireInstruction } from "../instructions/fire-instruction";

export class DodgeEnemiesTarget implements ITarget {
    goal = 'avoid';

    private playerToAvoidID: number;
    private gotoLocationConfig = new GotoLocationConfig();
    
    constructor(private env: IAirmashEnvironment, private character: BotCharacter) {

        const me = env.me();
        const otherAircrafts = env.getPlayers()
            .filter(x => x.id !== env.myId() && x.team !== me.team)
            .filter(x => !x.isHidden && x.isInView && !x.isStealthed);

        let closestAircraft: {
            distance: number,
            player: PlayerInfo,
        };
        const myPos = me.pos;

        for (var i = 0; i < otherAircrafts.length; i++) {
            const p = otherAircrafts[i];

            const delta = Calculations.getDelta(myPos, p.pos);
            if (!closestAircraft || delta.distance < closestAircraft.distance) {
                closestAircraft = {
                    player: p,
                    distance: delta.distance
                };
            }
        }

        if (closestAircraft) {
            const distanceToKeep = this.getDistanceToKeep();

            if (closestAircraft.distance < distanceToKeep) {
                this.playerToAvoidID = closestAircraft.player.id;
            }
        }
    }

    private getDistanceToKeep(): number {
        const myHealth = this.env.me().health;
        const healthAnxiety = myHealth <= this.character.fleeHealth ? 20 : 1;
        const healthFactor = myHealth > 0 ?  1 / myHealth : 100;
        return this.character.otherAircraftDistance * healthFactor * healthAnxiety;
    }

    isValid(): boolean {
        const enemy = this.env.getPlayer(this.playerToAvoidID);

        if (!enemy || enemy.isHidden || !enemy.isInView || enemy.isStealthed) {
            return false;
        }

        const delta = Calculations.getDelta(this.env.me().pos, enemy.pos);
        return delta.distance < this.getDistanceToKeep();
    }


    getInstructions(): IInstruction[] {

        const result = [];

        const enemyPos = this.getEnemyPos(this.character.predictPositions);
        if (!enemyPos) {
            return result;
        }

        this.gotoLocationConfig.desiredDistanceToTarget = this.character.intimateRange;
        this.gotoLocationConfig.targetPos = enemyPos;
        this.gotoLocationConfig.backwards = true;

        var instruction = new GotoLocationInstruction(this.env, this.character);
        instruction.configure(this.gotoLocationConfig);
        result.push(instruction);

        result.push(new FireInstruction());
                
        return result;
    }

    private getEnemyPos(predictPositions: boolean): Pos {
        var enemy = this.env.getPlayer(this.playerToAvoidID);
        if (enemy) {
            let pos = PlayerInfo.getMostReliablePos(enemy);

            if (predictPositions && pos.isAccurate) {
                pos = Calculations.predictPosition(this.env.getPing(), pos, enemy.speed);
            }

            return pos;
        }
        return null;
    }

    onKill(killerID: number, killedID: number) {
    }


}