import { ITarget } from "./itarget";
import { GotoLocationInstruction } from "../instructions/goto-location";
import { IInstruction } from "../instructions/iinstruction";
import { GotoLocationConfig } from "../instructions/goto-location-config";
import { IAirmashEnvironment } from "../airmash/iairmash-environment";
import { Pos } from "../pos";

export class GotoLocationTarget implements ITarget {
    private gotoLocationConfig = new GotoLocationConfig();

    goal = "gotoLocation";
    
    constructor(private env: IAirmashEnvironment, private readonly targetPos: Pos) {
    }

    onKill(killerID: number, killedID: number) {
    }

    getInstructions(): IInstruction[] {
        const result = [];

        this.gotoLocationConfig.desiredDistanceToTarget = 0;
        this.gotoLocationConfig.targetPos = this.targetPos;

        var instruction = new GotoLocationInstruction(this.env, null);
        instruction.configure(this.gotoLocationConfig);
        result.push(instruction);

        return result;
    }

    getInfo() {
        return {
            info: 'goto location ' + this.targetPos.x + ', ' + this.targetPos.y,
            id: null
        };
    }

    isValid(): boolean {
        return true;
    }
}