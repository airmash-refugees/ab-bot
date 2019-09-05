import * as marshaling from '../../ab-protocol/src/marshaling';
import * as unmarshaling from '../../ab-protocol/src/unmarshaling';
import CLIENT_PACKETS from '../../ab-protocol/src/packets/client';
import SERVER_PACKETS from '../../ab-protocol/src/packets/server';
import { KEY_CODES } from '../../ab-protocol/src/types/client';
import { decodeMinimapCoords } from '../../ab-protocol/src/decoding/index';
import WebSocket from 'ws';
import { ProtocolPacket } from '../../ab-protocol/src/packets';
import { Game } from './Game';
import { Mob } from './Mob';
import { CHAT_TYPE } from './chat-type';
import { Player } from './Player';
import { Pos } from '../bot/pos';

export class Network {
    private client: WebSocket;
    private backupClient: WebSocket;
    private backupClientIsConnected: boolean;
    private ackToBackup: boolean;
    private ackInterval: any;
    private game: Game;
    private keyCount: number = 0;
    private token: string;

    constructor(private ws: string) {
    }

    start(game: Game, name: string, flag: string) {
        this.game = game;
        this.client = this.initWebSocket({
            isPrimary: true,
            name,
            flag
        });
    }

    private initWebSocket(config: any, tries = 1) {
        const ws = new WebSocket(this.ws);
        ws.binaryType = "arraybuffer";

        ws.onopen = () => {
            tries -= 1;
            if (config.isPrimary) {
                console.log("Primary socket connecting");
                this.send({
                    c: CLIENT_PACKETS.LOGIN,
                    protocol: 5,
                    name: config.name,
                    session: "none",
                    horizonX: Math.ceil(640),
                    horizonY: Math.ceil(480),
                    flag: config.flag
                });
            } else {
                console.log("Backup socket connecting");
                this.backupClientIsConnected = true;
                this.send({
                    c: CLIENT_PACKETS.BACKUP,
                    token: this.token
                }, true);
            }
        };
        ws.onmessage = (msg: { data: ArrayBuffer; }) => {
            try {
                const result = unmarshaling.unmarshalServerMessage(msg.data);
                this.onServerMessage(result);
            } catch (error) {
                this.game.onError(error);
            }
        };
        ws.onerror = (ev) => {
            console.log(ev);
            this.game.onError(new Error((config.isPrimary ? 'primary' : 'backup') + ' socket error' + ev));

            if (tries <= 3 && config.isPrimary) {
                this.client = this.initWebSocket(config, tries + 1);
            }
        };
        ws.onclose = () => {
            console.log('socket closed');
            this.game.onError(new Error((config.isPrimary ? 'primary' : 'backup') + ' socket closed'));
        };
        return ws;
    }

    sendKey(key: KEY_CODES, value: boolean) {
        this.keyCount++;
        var msg = {
            c: CLIENT_PACKETS.KEY,
            seq: this.keyCount,
            key: key,
            state: value
        };
        this.send(msg);
        if (this.backupClientIsConnected) {
            this.send(msg, true);
        }
    }

    sendCommand(command: string, params: string) {
        var msg = {
            c: CLIENT_PACKETS.COMMAND,
            com: command,
            data: params
        };
        this.send(msg);
    }

    chat(type: CHAT_TYPE, text: string, targetPlayerID: number = null) {
        var c: number;
        switch (type) {
            case CHAT_TYPE.CHAT:
                c = CLIENT_PACKETS.CHAT;
                break;
            case CHAT_TYPE.SAY:
                c = CLIENT_PACKETS.SAY;
                break;
            case CHAT_TYPE.TEAM:
                c = CLIENT_PACKETS.TEAMCHAT;
                break;
            case CHAT_TYPE.WHISPER:
                c = CLIENT_PACKETS.WHISPER;
                break;
        }

        var msg = {
            c,
            text,
            id: targetPlayerID
        };
        this.send(msg);
    }

    private onServerMessage(msg: ProtocolPacket) {
        switch (msg.c) {
            case SERVER_PACKETS.BACKUP:
                console.log("backup client connected");
                this.backupClientIsConnected = true;
                break;

            case SERVER_PACKETS.LOGIN:
                this.initialize(msg);
                break;

            case SERVER_PACKETS.SCORE_UPDATE:
                this.game.onScore(msg.score as number);
                this.game.onUpgrades(msg.upgrades as number);
                break;

            case SERVER_PACKETS.PLAYER_NEW:
            case SERVER_PACKETS.PLAYER_UPDATE:
                this.game.onPlayerInfo(msg as any);
                break;

            case SERVER_PACKETS.PLAYER_RESPAWN:
                this.game.onPlayerInfo(msg as any);
                this.game.onRespawn(msg.id as number);
                break;

            case SERVER_PACKETS.PLAYER_TYPE:
                const p = this.game.getPlayer(msg.id as number);
                if (p) {
                    p.type = msg.type as number;
                }
                break;

            case SERVER_PACKETS.PLAYER_KILL:
                const killed = this.game.getPlayer(msg.id as number);
                if (killed) {
                    killed.dead = true;
                }

                this.game.onKill(msg.id as number, msg.killer as number);
                break;

            case SERVER_PACKETS.PLAYER_LEAVE:
                this.game.onPlayerLeave(msg.id as number);
                break;

            case SERVER_PACKETS.PLAYER_FIRE:
                const playerID = msg.id as number;
                const missiles = msg.projectiles as Mob[];
                for (const missile of missiles) {
                    missile.ownerID = playerID;
                    this.game.onMob(missile);
                }
                const firingPlayer = this.game.getPlayer(playerID);
                if (firingPlayer) {
                    firingPlayer.energy = msg.energy as number;
                    firingPlayer.energyRegen = msg.energyRegen as number;
                }
                break;

            case SERVER_PACKETS.PLAYER_HIT:
                const hitPlayers = msg.players as Player[];
                for (const hit of hitPlayers) {
                    const hitPlayer = this.game.getPlayer(hit.id);
                    hitPlayer.health = hit.health;
                    hitPlayer.healthRegen = hit.healthRegen;
                    this.game.onHit(hit.id);
                }
                break;

            case SERVER_PACKETS.EVENT_BOOST:
                const boostingPlayer = this.game.getPlayer(msg.id as number);
                if (boostingPlayer) {
                    boostingPlayer.energy = msg.energy as number;
                    boostingPlayer.energyRegen = msg.energyRegen as number;
                }
                break;

            case SERVER_PACKETS.SCORE_BOARD:
                const minimapData = msg.rankings as any[];
                for (let i = 0; i < minimapData.length; i++) {
                    const playerMinimapData = minimapData[i];
                    const minimapPlayer = this.game.getPlayer(playerMinimapData.id);
                    if (minimapPlayer) {
                        const coords = decodeMinimapCoords(playerMinimapData.x, playerMinimapData.y);
                        minimapPlayer.lowResPos = new Pos(coords);
                        minimapPlayer.lowResPos.isAccurate = false;
                    }
                }
                break;

            case SERVER_PACKETS.MOB_UPDATE_STATIONARY:
                const mob1 = msg as any;
                mob1.stationary = true;
                this.game.onMob(mob1);
                break;

            case SERVER_PACKETS.MOB_UPDATE:
                const mob2 = msg as any;
                this.game.onMob(mob2);
                break;

            case SERVER_PACKETS.MOB_DESPAWN:
            case SERVER_PACKETS.MOB_DESPAWN_COORDS:
                this.game.onMobDespawned(msg.id as number);
                break;

            case SERVER_PACKETS.EVENT_REPEL:
                const goliID = msg.id as number;
                const repelledMobs = msg.mobs as Mob[];
                for (const repelledMob of repelledMobs) {
                    repelledMob.ownerID = goliID; // mob changes owner on repellation
                    this.game.onMob(repelledMob);
                }
                break;

            case SERVER_PACKETS.EVENT_STEALTH:
                const prowler = this.game.getPlayer(msg.id as number);
                if (prowler) {
                    prowler.stealth = msg.state as boolean;
                }
                break;

            case SERVER_PACKETS.CHAT_PUBLIC:
            case SERVER_PACKETS.CHAT_TEAM:
            case SERVER_PACKETS.CHAT_SAY:
            case SERVER_PACKETS.CHAT_WHISPER:
                this.game.onChat(msg.id as number, msg.text as string);
                break;

            //ignore
            case SERVER_PACKETS.PING:
            case SERVER_PACKETS.SCORE_BOARD:
            case SERVER_PACKETS.EVENT_BOUNCE:
            case SERVER_PACKETS.EVENT_LEAVEHORIZON:
                break;

            // todo
            case SERVER_PACKETS.PLAYER_POWERUP:
                break;

            default:
                console.log(msg);
                break;
        }
    }

    private initialize(msg: ProtocolPacket) {
        // send regular ack messages to keep the connection alive
        clearInterval(this.ackInterval);
        this.ackInterval = setInterval(() => {
            this.send({ c: CLIENT_PACKETS.ACK }, this.ackToBackup);
            this.ackToBackup = !this.ackToBackup;
        }, 50);

        this.token = msg.token as string;

        if (this.backupClientIsConnected) {
            this.backupClient.close();
            this.backupClientIsConnected = false;
        }
        this.backupClient = this.initWebSocket({ isPrimary: false });

        // send start info to game
        const players = msg.players as [];
        for (const p of players) {
            this.game.onPlayerInfo(p);
        }
        this.game.onStart(msg.id as number);
    }

    private send(msg: ProtocolPacket, sendToBackup: boolean = false) {
        const clientMgs = marshaling.marshalClientMessage(msg);
        if (sendToBackup) {
            if (this.backupClientIsConnected) {
                this.backupClient.send(clientMgs);
            }
        } else {
            this.client.send(clientMgs);
        }
    }

}