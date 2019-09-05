export class Mob {

    constructor(m: Mob) {
        if (m != null) {
            this.copyFrom(m);
        }
    }

    id: number;
    ownerID: number;
    type: number;
    posX: number;
    posY: number;
    stationary: boolean;
    speedX: number;
    speedY: number;
    rot: number;
    lastUpdate: number;

    isStale(): boolean {
        return Date.now() - this.lastUpdate > 2000;
    }

    copyFrom(m: Mob) {
        this.id = m.id;
        this.stationary = m.stationary;

        this.ownerID = m.ownerID || this.ownerID;
        this.type = m.type || this.type;
        
        this.posX = m.posX;
        this.posY = m.posY;
        this.speedX = m.speedX;
        this.speedY = m.speedY;
        this.rot = m.rot;

        this.lastUpdate = Date.now();
    }
}