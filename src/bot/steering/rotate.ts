import { IAirmashEnvironment } from "../airmash/iairmash-environment";
import { SteeringState } from "./steering-state";
import { steeringInstallationIntervalMs } from "./steering-installation";
import { PlayerInfo } from "../airmash/player-info";

const precision: number = 0.05;

const rotationSpeeds = {
    1: 0.39, // predator
    2: 0.24, // goliath
    3: 0.42, // mohawk
    4: 0.33, // tornado
    5: 0.33  // prowler
};

export class Rotate {
    private left: SteeringState = new SteeringState('LEFT');
    private right: SteeringState = new SteeringState('RIGHT');
    private currentRotationTimeout: any;

    constructor(private env: IAirmashEnvironment) {
    }

    execute(me: PlayerInfo, rotDelta: number) {
        const absDelta = Math.abs(rotDelta);

        if (this.currentRotationTimeout || !rotDelta || absDelta < precision) {
            return;
        }

        let stateToUse = this.left;
        let otherState= this.right;
        if (rotDelta > 0) {
            stateToUse = this.right;
            otherState = this.left;
        }

        otherState.send(this.env, false);
        stateToUse.send(this.env, true);

        const timeToWait = absDelta / rotationSpeeds[me.type];
        this.currentRotationTimeout = setTimeout(() => {
            stateToUse.send(this.env, false);
            this.currentRotationTimeout = null
         }, timeToWait * 100);
    }
}