import { CONFIG } from "./config.js";

export class Intersection {
    constructor(centerX, centerY) {
        this.centerX = centerX;
        this.centerY = centerY;
        
        // Physical dimensions
        this.laneWidth = CONFIG.LANE_WIDTH;
        this.nLanesMain = CONFIG.N_LANES_MAIN;
        this.nLanesSec = CONFIG.N_LANES_SEC;
        this.radiusRight = CONFIG.RADIUS_RIGHT;
        this.radiusLeft = CONFIG.RADIUS_LEFT;
        this.lenRight = CONFIG.LEN_RIGHT;
        this.lenLeft = CONFIG.LEN_LEFT;
        
        // Scale factor for pixel conversion
        this.scale = CONFIG.CANVAS_WIDTH / CONFIG.REF_SIZE_PHYS;
        
        // Road segments
        this.roads = [];
        this.nSegm = CONFIG.N_SEGM;
        
        this.initializeRoads();
        this.calculatePositions();
    }

    initializeRoads() {
        // Create 6 road segments as per the specification
        this.roads = [
            this.createRoad(0, 'east-bound'),   // Road 0: East-bound main
            this.createRoad(1, 'west-bound'),   // Road 1: West-bound main
            this.createRoad(2, 'north-bound'),  // Road 2: North-bound secondary
            this.createRoad(3, 'north-exit'),   // Road 3: North exit
            this.createRoad(4, 'south-bound'),  // Road 4: South-bound secondary
            this.createRoad(5, 'south-exit')    // Road 5: South exit
        ];
        
        this.setupTrajectories();
        this.setupAlternativeTrajectories();
    }

    createRoad(id, type) {
        return {
            id: id,
            type: type,
            roadLen: 200, // 200 meters
            nLanes: type.includes('main') ? this.nLanesMain : this.nLanesSec,
            traj: [null, null], // [x_function, y_function]
            trajAlt: [], // Alternative trajectories for turns
            draw_x: new Array(this.nSegm),
            draw_y: new Array(this.nSegm),
            draw_phi: new Array(this.nSegm),
            draw_cosphi: new Array(this.nSegm),
            draw_sinphi: new Array(this.nSegm)
        };
    }

    setupTrajectories() {
        const centerXPhys = this.centerX / this.scale;
        const centerYPhys = this.centerY / this.scale;
        const offsetMain = CONFIG.OFFSET_MAIN;
        const offsetSec = CONFIG.OFFSET_SEC;
        const offset20Target = CONFIG.OFFSET_20_TARGET;

        // Road 0 (East-bound main)
        this.roads[0].traj[0] = (u) => centerXPhys + u - 0.5 * this.roads[0].roadLen;
        this.roads[0].traj[1] = (u) => centerYPhys - offsetMain;

        // Road 1 (West-bound main)
        this.roads[1].traj[0] = (u) => centerXPhys - u + 0.5 * this.roads[1].roadLen;
        this.roads[1].traj[1] = (u) => centerYPhys + offsetMain;

        // Road 2 (North-bound secondary)
        this.roads[2].traj[0] = (u) => centerXPhys + offsetSec;
        this.roads[2].traj[1] = (u) => centerYPhys - offset20Target - this.radiusRight - this.roads[2].roadLen + u;

        // Road 3 (North exit)
        this.roads[3].traj[0] = (u) => centerXPhys - offsetSec;
        this.roads[3].traj[1] = (u) => centerYPhys + offset20Target + this.radiusRight + u;

        // Road 4 (South-bound secondary)
        this.roads[4].traj[0] = (u) => centerXPhys - offsetSec;
        this.roads[4].traj[1] = (u) => centerYPhys + offset20Target + this.radiusRight + this.roads[4].roadLen - u;

        // Road 5 (South exit)
        this.roads[5].traj[0] = (u) => centerXPhys + offsetSec;
        this.roads[5].traj[1] = (u) => centerYPhys - offset20Target - this.radiusRight - u;

        // Pre-compute drawing arrays for each road
        this.roads.forEach(road => this.precomputeDrawingArrays(road));
    }

    setupAlternativeTrajectories() {
        const centerXPhys = this.centerX / this.scale;
        const centerYPhys = this.centerY / this.scale;
        const u20Target = 104.16; // Start position for turns

        // Right turn trajectories
        this.setupRightTurnTrajectory(0, 2, centerXPhys, centerYPhys, u20Target); // East to North
        this.setupRightTurnTrajectory(1, 4, centerXPhys, centerYPhys, u20Target); // West to South
        this.setupRightTurnTrajectory(2, 0, centerXPhys, centerYPhys, u20Target); // North to East
        this.setupRightTurnTrajectory(4, 1, centerXPhys, centerYPhys, u20Target); // South to West

        // Left turn trajectories
        this.setupLeftTurnTrajectory(0, 3, centerXPhys, centerYPhys, u20Target); // East to North exit
        this.setupLeftTurnTrajectory(1, 5, centerXPhys, centerYPhys, u20Target); // West to South exit
        this.setupLeftTurnTrajectory(2, 1, centerXPhys, centerYPhys, u20Target); // North to West
        this.setupLeftTurnTrajectory(4, 0, centerXPhys, centerYPhys, u20Target); // South to East
    }

    setupRightTurnTrajectory(fromRoadId, toRoadId, centerXPhys, centerYPhys, u20Target) {
        const road = this.roads[fromRoadId];
        const offsetSource = fromRoadId < 2 ? CONFIG.OFFSET_MAIN : CONFIG.OFFSET_SEC;
        const offset20Target = CONFIG.OFFSET_20_TARGET;

        const trajRight_x = (u, dr = 0) => {
            const urel = u - u20Target;
            const x0 = centerXPhys + offsetSource + this.radiusRight;
            
            return (urel < 0) 
                ? x0 - (this.radiusRight + dr)
                : x0 - (this.radiusRight + dr) * Math.cos(urel / this.radiusRight);
        };

        const trajRight_y = (u, dr = 0) => {
            const urel = u - u20Target;
            const y0 = centerYPhys - offset20Target - this.radiusRight;
            
            return (urel < 0)
                ? y0 + urel
                : y0 + (this.radiusRight + dr) * Math.sin(urel / this.radiusRight);
        };

        road.trajAlt.push({
            x: trajRight_x,
            y: trajRight_y,
            roadID: toRoadId,
            umin: u20Target,
            umax: u20Target + this.lenRight,
            laneMin: road.nLanes - 1,
            laneMax: road.nLanes - 1
        });
    }

    setupLeftTurnTrajectory(fromRoadId, toRoadId, centerXPhys, centerYPhys, u20Target) {
        const road = this.roads[fromRoadId];
        const offsetSource = fromRoadId < 2 ? CONFIG.OFFSET_MAIN : CONFIG.OFFSET_SEC;
        const straightSec = this.lenLeft - CONFIG.LEN_LEFT;

        const trajLeft_x = (u, dr = 0) => {
            const x0 = centerXPhys + offsetSource - this.radiusLeft;
            const urel = u - u20Target;
            
            return (urel < straightSec) 
                ? x0 + (this.radiusLeft + dr)
                : x0 + (this.radiusLeft + dr) * Math.cos((urel - straightSec) / this.radiusLeft);
        };

        const trajLeft_y = (u, dr = 0) => {
            const y0 = centerYPhys - CONFIG.OFFSET_20_TARGET - this.radiusLeft;
            const urel = u - u20Target;
            
            return (urel < straightSec)
                ? y0 + urel
                : y0 + (this.radiusLeft + dr) * Math.sin((urel - straightSec) / this.radiusLeft);
        };

        road.trajAlt.push({
            x: trajLeft_x,
            y: trajLeft_y,
            roadID: toRoadId,
            umin: u20Target,
            umax: u20Target + this.lenLeft,
            laneMin: 0,
            laneMax: 0
        });
    }

    precomputeDrawingArrays(road) {
        const lSegm = road.roadLen / this.nSegm;
        
        for (let iSegm = 0; iSegm < this.nSegm; iSegm++) {
            const u = (iSegm + 0.5) * lSegm;
            
            road.draw_x[iSegm] = road.traj[0](u);
            road.draw_y[iSegm] = road.traj[1](u);
            road.draw_phi[iSegm] = this.get_phi(u, road.traj, road.roadLen);
            road.draw_cosphi[iSegm] = Math.cos(road.draw_phi[iSegm]);
            road.draw_sinphi[iSegm] = Math.sin(road.draw_phi[iSegm]);
        }
    }

    get_phi(u, traj, roadLen) {
        const du = 0.1;
        const uLoc = Math.max(du, Math.min(roadLen - du, u));
        const dx = traj[0](uLoc + du) - traj[0](uLoc - du);
        const dy = traj[1](uLoc + du) - traj[1](uLoc - du);
        
        let phi = (Math.abs(dx) < 0.0000001) ? 0.5 * Math.PI : Math.atan(dy / dx);
        if ((dx < 0) || ((Math.abs(dx) < 0.0000001) && (dy < 0))) {
            phi += Math.PI;
        }
        return phi;
    }

    calculatePositions() {
        const halfSize = CONFIG.INTERSECTION_SIZE / 2;
        const halfRoad = CONFIG.ROAD_WIDTH / 2;
        const laneOffset = CONFIG.LANE_WIDTH / 2;
        
        // Stop line positions
        const stopLineOffset = halfSize + 5;
        this.stopLines = {
            [CONFIG.DIRECTIONS.NORTH]: {
                x1: this.centerX - halfRoad,
                y1: this.centerY - stopLineOffset,
                x2: this.centerX + halfRoad,
                y2: this.centerY - stopLineOffset
            },
            [CONFIG.DIRECTIONS.EAST]: {
                x1: this.centerX + stopLineOffset,
                y1: this.centerY - halfRoad,
                x2: this.centerX + stopLineOffset,
                y2: this.centerY + halfRoad
            },
            [CONFIG.DIRECTIONS.SOUTH]: {
                x1: this.centerX - halfRoad,
                y1: this.centerY + stopLineOffset,
                x2: this.centerX + halfRoad,
                y2: this.centerY + stopLineOffset
            },
            [CONFIG.DIRECTIONS.WEST]: {
                x1: this.centerX - stopLineOffset,
                y1: this.centerY - halfRoad,
                x2: this.centerX - stopLineOffset,
                y2: this.centerY + halfRoad
            }
        };

        // Traffic light positions
        this.lightPositions = {
            [CONFIG.DIRECTIONS.NORTH]: {
                x: this.centerX - 25,
                y: this.centerY - halfSize - 40
            },
            [CONFIG.DIRECTIONS.EAST]: {
                x: this.centerX + halfSize + 15,
                y: this.centerY - 25
            },
            [CONFIG.DIRECTIONS.SOUTH]: {
                x: this.centerX + 25,
                y: this.centerY + halfSize + 15
            },
            [CONFIG.DIRECTIONS.WEST]: {
                x: this.centerX - halfSize - 40,
                y: this.centerY + 25
            }
        };

        // Car spawn points
        this.spawnPoints = {
            [CONFIG.DIRECTIONS.NORTH]: {
                x: this.centerX - laneOffset,
                y: 0
            },
            [CONFIG.DIRECTIONS.EAST]: {
                x: CONFIG.CANVAS_WIDTH,
                y: this.centerY - laneOffset
            },
            [CONFIG.DIRECTIONS.SOUTH]: {
                x: this.centerX + laneOffset,
                y: CONFIG.CANVAS_HEIGHT
            },
            [CONFIG.DIRECTIONS.WEST]: {
                x: 0,
                y: this.centerY + laneOffset
            }
        };
        
        this.updateSpawnPointsForLanes();

        // Exit points
        this.exitPoints = {
            [CONFIG.DIRECTIONS.NORTH]: {
                x: this.centerX + laneOffset,
                y: 0
            },
            [CONFIG.DIRECTIONS.EAST]: {
                x: CONFIG.CANVAS_WIDTH,
                y: this.centerY + laneOffset
            },
            [CONFIG.DIRECTIONS.SOUTH]: {
                x: this.centerX - laneOffset,
                y: CONFIG.CANVAS_HEIGHT
            },
            [CONFIG.DIRECTIONS.WEST]: {
                x: 0,
                y: this.centerY - laneOffset
            }
        };
    }

    updateSpawnPointsForLanes() {
        const laneOffset = CONFIG.LANE_WIDTH / 2;
        
        this.spawnPointsByLane = {
            [CONFIG.DIRECTIONS.NORTH]: [
                { x: this.centerX - laneOffset, y: 0 },
                { x: this.centerX + laneOffset, y: CONFIG.CANVAS_HEIGHT }
            ],
            [CONFIG.DIRECTIONS.EAST]: [
                { x: CONFIG.CANVAS_WIDTH, y: this.centerY - laneOffset },
                { x: 0, y: this.centerY + laneOffset }
            ],
            [CONFIG.DIRECTIONS.SOUTH]: [
                { x: this.centerX + laneOffset, y: CONFIG.CANVAS_HEIGHT },
                { x: this.centerX - laneOffset, y: 0 }
            ],
            [CONFIG.DIRECTIONS.WEST]: [
                { x: 0, y: this.centerY + laneOffset },
                { x: CONFIG.CANVAS_WIDTH, y: this.centerY - laneOffset }
            ]
        };
    }

    getSpawnPointForLane(direction, lane) {
        return this.spawnPointsByLane[direction] ? this.spawnPointsByLane[direction][lane] : this.spawnPoints[direction];
    }

    render(ctx) {
        this.drawRoads(ctx);
        this.drawIntersection(ctx);
        this.drawLaneMarkings(ctx);
        this.drawStopLines(ctx);
    }

    drawRoads(ctx) {
        // Draw each road segment using pre-computed arrays
        this.roads.forEach(road => {
            this.drawRoadSegments(ctx, road);
        });
    }

    drawRoadSegments(ctx, road) {
        const lSegm = road.roadLen / this.nSegm;
        const lSegmPix = this.scale * lSegm;
        const wSegmPix = this.scale * (road.nLanes * this.laneWidth + CONFIG.BOUNDARY_STRIP_WIDTH);

        ctx.fillStyle = '#444444';

        for (let iSegm = 0; iSegm < this.nSegm; iSegm++) {
            const xCenterPix = this.scale * road.draw_x[iSegm];
            const yCenterPix = -this.scale * road.draw_y[iSegm]; // Y inverted for screen coordinates
            const cosphi = road.draw_cosphi[iSegm];
            const sinphi = road.draw_sinphi[iSegm];

            ctx.save();
            ctx.setTransform(cosphi, -sinphi, +sinphi, cosphi, xCenterPix, yCenterPix);
            ctx.fillRect(-0.5 * lSegmPix, -0.5 * wSegmPix, lSegmPix, wSegmPix);
            ctx.restore();
        }
    }

    drawIntersection(ctx) {
        const halfRoad = CONFIG.ROAD_WIDTH / 2;
        const curveRadius = halfRoad;

        ctx.fillStyle = '#666666';
        ctx.beginPath();

        // Draw intersection with curved corners
        ctx.moveTo(this.centerX - halfRoad, this.centerY - halfRoad - curveRadius);
        
        // Top left curve
        ctx.quadraticCurveTo(
            this.centerX - halfRoad, this.centerY - halfRoad,
            this.centerX - halfRoad - curveRadius, this.centerY - halfRoad
        );
        
        ctx.lineTo(this.centerX - halfRoad - curveRadius, this.centerY + halfRoad);
        
        // Bottom left curve
        ctx.quadraticCurveTo(
            this.centerX - halfRoad, this.centerY + halfRoad,
            this.centerX - halfRoad, this.centerY + halfRoad + curveRadius
        );
        
        ctx.lineTo(this.centerX + halfRoad, this.centerY + halfRoad + curveRadius);
        
        // Bottom right curve
        ctx.quadraticCurveTo(
            this.centerX + halfRoad, this.centerY + halfRoad,
            this.centerX + halfRoad + curveRadius, this.centerY + halfRoad
        );
        
        ctx.lineTo(this.centerX + halfRoad + curveRadius, this.centerY - halfRoad);
        
        // Top right curve
        ctx.quadraticCurveTo(
            this.centerX + halfRoad, this.centerY - halfRoad,
            this.centerX + halfRoad, this.centerY - halfRoad - curveRadius
        );
        
        ctx.closePath();
        ctx.fill();
    }

    drawLaneMarkings(ctx) {
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 2;
        ctx.setLineDash([10, 10]);

        const halfRoad = CONFIG.ROAD_WIDTH / 2;
        
        // Vertical center line
        ctx.beginPath();
        ctx.moveTo(this.centerX, 0);
        ctx.lineTo(this.centerX, this.centerY - halfRoad);
        ctx.moveTo(this.centerX, this.centerY + halfRoad);
        ctx.lineTo(this.centerX, CONFIG.CANVAS_HEIGHT);
        ctx.stroke();
        
        // Horizontal center line
        ctx.beginPath();
        ctx.moveTo(0, this.centerY);
        ctx.lineTo(this.centerX - halfRoad, this.centerY);
        ctx.moveTo(this.centerX + halfRoad, this.centerY);
        ctx.lineTo(CONFIG.CANVAS_WIDTH, this.centerY);
        ctx.stroke();

        ctx.setLineDash([]);
    }

    drawStopLines(ctx) {
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 4;
        
        Object.values(this.stopLines).forEach(line => {
            ctx.beginPath();
            ctx.moveTo(line.x1, line.y1);
            ctx.lineTo(line.x2, line.y2);
            ctx.stroke();
        });
    }

    // Helper methods
    getStopLinePosition(direction) {
        return this.stopLines[direction];
    }

    getLightPosition(direction) {
        if (!direction || typeof direction !== 'string') {
            console.warn("Invalid direction for getLightPosition:", direction);
            return undefined;
        }
        return this.lightPositions[direction];
    }

    isInIntersection(x, y) {
        const halfRoad = CONFIG.ROAD_WIDTH / 2;
        return (
            x >= this.centerX - halfRoad &&
            x <= this.centerX + halfRoad &&
            y >= this.centerY - halfRoad &&
            y <= this.centerY + halfRoad
        );
    }

    getExitPoint(direction) {
        const offset = 300;
        switch (direction) {
            case 'north': return { x: this.centerX, y: this.centerY - offset };
            case 'south': return { x: this.centerX, y: this.centerY + offset };
            case 'east': return { x: this.centerX + offset, y: this.centerY };
            case 'west': return { x: this.centerX - offset, y: this.centerY };
            default: return undefined;
        }
    }

    getPathEntryPoint(direction) {
        const halfRoad = CONFIG.ROAD_WIDTH / 2;
        const laneOffset = CONFIG.LANE_WIDTH / 2;
        
        switch (direction) {
            case CONFIG.DIRECTIONS.NORTH:
                return { x: this.centerX - laneOffset, y: this.centerY - halfRoad };
            case CONFIG.DIRECTIONS.EAST:
                return { x: this.centerX + halfRoad, y: this.centerY - laneOffset };
            case CONFIG.DIRECTIONS.SOUTH:
                return { x: this.centerX + laneOffset, y: this.centerY + halfRoad };
            case CONFIG.DIRECTIONS.WEST:
                return { x: this.centerX - halfRoad, y: this.centerY + laneOffset };
        }
    }

    setCarManager(carManager) {
        this.carManager = carManager;
    }
    
    getAllCars() {
        return this.carManager ? this.carManager.getCars() : [];
    }

    // Vehicle positioning methods
    getVehiclePosition(roadId, u, v) {
        const road = this.roads[roadId];
        if (!road) return null;

        const uCenterPhys = u - 0.5 * CONFIG.CAR_LENGTH;
        const vCenterPhys = this.laneWidth * (v - 0.5 * (road.nLanes - 1));

        const x = road.traj[0](uCenterPhys) + vCenterPhys * Math.cos(this.get_phi(uCenterPhys, road.traj, road.roadLen) + Math.PI/2);
        const y = road.traj[1](uCenterPhys) + vCenterPhys * Math.sin(this.get_phi(uCenterPhys, road.traj, road.roadLen) + Math.PI/2);

        return { x: x * this.scale, y: -y * this.scale };
    }

    getVehicleOrientation(roadId, u, dvdt, speed) {
        const road = this.roads[roadId];
        if (!road) return 0;

        const uCenterPhys = u - 0.5 * CONFIG.CAR_LENGTH;
        const phiRoad = this.get_phi(uCenterPhys, road.traj, road.roadLen);
        const phiVehRel = -Math.atan(dvdt * this.laneWidth / speed);
        
        return phiRoad + phiVehRel;
    }
}