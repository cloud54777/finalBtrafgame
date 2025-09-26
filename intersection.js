import { CONFIG } from "./config.js";
export class Intersection {
    getPathEntryPoint(direction) {
        // Entry point for Bezier curve (lane center at intersection edge)
        const halfRoad = this.roadWidth / 2;
        const laneOffset = this.laneWidth / 2;
        switch (direction) {
            case CONFIG.DIRECTIONS.NORTH:
                return { x: this.centerX - laneOffset, y: this.centerY - halfRoad };
            case CONFIG.DIRECTIONS.EAST:
                return { x: this.centerX + halfRoad, y: this.centerY - laneOffset };
            case CONFIG.DIRECTIONS.SOUTH:
                return { x: this.centerX + laneOffset, y: this.centerY + halfRoad };
            case CONFIG.DIRECTIONS.WEST:
                return { x: this.centerX - halfRoad, y: this.centerY + laneOffset };
            default:
                return { x: this.centerX, y: this.centerY };
        }
    }
    constructor(centerX, centerY) {
        this.centerX = centerX;
        this.centerY = centerY;
        this.size = CONFIG.INTERSECTION_SIZE;
        this.roadWidth = CONFIG.ROAD_WIDTH;
        this.laneWidth = CONFIG.LANE_WIDTH;
        
        this.calculatePositions();
    }

    initialize() {
        this.calculatePositions();
    }

    calculatePositions() {
        const halfSize = this.size / 2;
        const halfRoad = this.roadWidth / 2;
        const laneOffset = this.laneWidth / 2;
        
        // Stop line positions (before intersection)
       // Stop line positions (before intersection, always close to center)
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
                x: this.centerX - laneOffset, // Default to right lane
                y: 0
            },
            [CONFIG.DIRECTIONS.EAST]: {
                x: CONFIG.CANVAS_WIDTH,
                y: this.centerY - laneOffset // Default to right lane
            },
            [CONFIG.DIRECTIONS.SOUTH]: {
                x: this.centerX + laneOffset, // Default to right lane
                y: CONFIG.CANVAS_HEIGHT
            },
            [CONFIG.DIRECTIONS.WEST]: {
                x: 0,
                y: this.centerY + laneOffset // Default to right lane
            }
        };
        
        // Update spawn points to support both lanes
        this.updateSpawnPointsForLanes();

        // Exit points - these are for straight-through traffic
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
        const laneOffset = this.laneWidth / 2;  // 7.5 pixels
        
        // Create spawn points for 4 lanes each direction
        // Lanes 0-1 = cars going one way, Lanes 2-3 = cars going opposite way
        this.spawnPointsByLane = {
            [CONFIG.DIRECTIONS.NORTH]: [
                // Lanes 0-1: Going south (left side of road)
                { x: this.centerX - laneOffset - this.laneWidth/2, y: 0 }, // Lane 0
                { x: this.centerX - laneOffset/2, y: 0 },                  // Lane 1
                // Lanes 2-3: Going north (right side of road)
                { x: this.centerX + laneOffset/2, y: CONFIG.CANVAS_HEIGHT }, // Lane 2
                { x: this.centerX + laneOffset + this.laneWidth/2, y: CONFIG.CANVAS_HEIGHT } // Lane 3
            ],
            [CONFIG.DIRECTIONS.EAST]: [
                // Lanes 0-1: Going west (top side of road)
                { x: CONFIG.CANVAS_WIDTH, y: this.centerY - laneOffset - this.laneWidth/2 }, // Lane 0
                { x: CONFIG.CANVAS_WIDTH, y: this.centerY - laneOffset/2 },                  // Lane 1
                // Lanes 2-3: Going east (bottom side of road)
                { x: 0, y: this.centerY + laneOffset/2 },                    // Lane 2
                { x: 0, y: this.centerY + laneOffset + this.laneWidth/2 }    // Lane 3
            ],
            [CONFIG.DIRECTIONS.SOUTH]: [
                // Lanes 0-1: Going north (right side of road)
                { x: this.centerX + laneOffset + this.laneWidth/2, y: CONFIG.CANVAS_HEIGHT }, // Lane 0
                { x: this.centerX + laneOffset/2, y: CONFIG.CANVAS_HEIGHT },                  // Lane 1
                // Lanes 2-3: Going south (left side of road)
                { x: this.centerX - laneOffset/2, y: 0 },                    // Lane 2
                { x: this.centerX - laneOffset - this.laneWidth/2, y: 0 }    // Lane 3
            ],
            [CONFIG.DIRECTIONS.WEST]: [
                // Lanes 0-1: Going east (bottom side of road)
                { x: 0, y: this.centerY + laneOffset + this.laneWidth/2 }, // Lane 0
                { x: 0, y: this.centerY + laneOffset/2 },                  // Lane 1
                // Lanes 2-3: Going west (top side of road)
                { x: CONFIG.CANVAS_WIDTH, y: this.centerY - laneOffset/2 },                  // Lane 2
                { x: CONFIG.CANVAS_WIDTH, y: this.centerY - laneOffset - this.laneWidth/2 }  // Lane 3
            ]
        };
    }

    getSpawnPointForLane(direction, lane) {
        if (this.spawnPointsByLane[direction] && this.spawnPointsByLane[direction][lane]) {
            return this.spawnPointsByLane[direction][lane];
        }
        return this.spawnPoints[direction];
    }

    render(ctx) {
        this.drawRoads(ctx);
        this.drawIntersection(ctx);
        this.drawLaneMarkings(ctx);
        this.drawStopLines(ctx);
    }

    drawRoads(ctx) {
        const halfRoad = this.roadWidth / 2;
        
        ctx.fillStyle = '#444444';
        
        // Vertical road (North-South)
        ctx.fillRect(
            this.centerX - halfRoad,
            0,
            this.roadWidth,
            CONFIG.CANVAS_HEIGHT
        );
        
        // Horizontal road (East-West)
        ctx.fillRect(
            0,
            this.centerY - halfRoad,
            CONFIG.CANVAS_WIDTH,
            this.roadWidth
        );
    }

drawIntersection(ctx) {
    const halfRoad = this.roadWidth / 2;
    const curveRadius = halfRoad; // Makes the inward curve meet nicely

    ctx.fillStyle = '#666666';
    ctx.beginPath();

    // Start top middle going clockwise
    ctx.moveTo(this.centerX - halfRoad, this.centerY - halfRoad - curveRadius);

    // Top left inward curve
    ctx.quadraticCurveTo(
        this.centerX - halfRoad, this.centerY - halfRoad,
        this.centerX - halfRoad - curveRadius, this.centerY - halfRoad
    );

    // Left top to left bottom
    ctx.lineTo(this.centerX - halfRoad - curveRadius, this.centerY + halfRoad);

    // Bottom left inward curve
    ctx.quadraticCurveTo(
        this.centerX - halfRoad, this.centerY + halfRoad,
        this.centerX - halfRoad, this.centerY + halfRoad + curveRadius
    );

    // Bottom middle to bottom right
    ctx.lineTo(this.centerX + halfRoad, this.centerY + halfRoad + curveRadius);

    // Bottom right inward curve
    ctx.quadraticCurveTo(
        this.centerX + halfRoad, this.centerY + halfRoad,
        this.centerX + halfRoad + curveRadius, this.centerY + halfRoad
    );

    // Right bottom to right top
    ctx.lineTo(this.centerX + halfRoad + curveRadius, this.centerY - halfRoad);

    // Top right inward curve
    ctx.quadraticCurveTo(
        this.centerX + halfRoad, this.centerY - halfRoad,
        this.centerX + halfRoad, this.centerY - halfRoad - curveRadius
    );

    // Back to start
    ctx.closePath();
    ctx.fill();

    // Restore normal drawing mode for anything after
    ctx.globalCompositeOperation = 'source-over';
}

    drawLaneMarkings(ctx) {
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 2;
        ctx.setLineDash([10, 10]);

        const halfRoad = this.roadWidth / 2;
        
        // Vertical lane markings (North-South road)
        ctx.beginPath();
        // Center divider
        ctx.moveTo(this.centerX, 0);
        ctx.lineTo(this.centerX, this.centerY - halfRoad);
        ctx.moveTo(this.centerX, this.centerY + halfRoad);
        ctx.lineTo(this.centerX, CONFIG.CANVAS_HEIGHT);
        
        // Lane divider for left side (between lanes 0 and 1)
        const leftDivider = this.centerX - this.laneWidth;
        ctx.moveTo(leftDivider, 0);
        ctx.lineTo(leftDivider, this.centerY - halfRoad);
        ctx.moveTo(leftDivider, this.centerY + halfRoad);
        ctx.lineTo(leftDivider, CONFIG.CANVAS_HEIGHT);
        
        // Lane divider for right side (between lanes 2 and 3)
        const rightDivider = this.centerX + this.laneWidth;
        ctx.moveTo(rightDivider, 0);
        ctx.lineTo(rightDivider, this.centerY - halfRoad);
        ctx.moveTo(rightDivider, this.centerY + halfRoad);
        ctx.lineTo(rightDivider, CONFIG.CANVAS_HEIGHT);
        ctx.stroke();
        
        // Horizontal lane markings (East-West road)
        ctx.beginPath();
        // Center divider
        ctx.moveTo(0, this.centerY);
        ctx.lineTo(this.centerX - halfRoad, this.centerY);
        ctx.moveTo(this.centerX + halfRoad, this.centerY);
        ctx.lineTo(CONFIG.CANVAS_WIDTH, this.centerY);
        
        // Lane divider for top side (between lanes 0 and 1)
        const topDivider = this.centerY - this.laneWidth;
        ctx.moveTo(0, topDivider);
        ctx.lineTo(this.centerX - halfRoad, topDivider);
        ctx.moveTo(this.centerX + halfRoad, topDivider);
        ctx.lineTo(CONFIG.CANVAS_WIDTH, topDivider);
        
        // Lane divider for bottom side (between lanes 2 and 3)
        const bottomDivider = this.centerY + this.laneWidth;
        ctx.moveTo(0, bottomDivider);
        ctx.lineTo(this.centerX - halfRoad, bottomDivider);
        ctx.moveTo(this.centerX + halfRoad, bottomDivider);
        ctx.lineTo(CONFIG.CANVAS_WIDTH, bottomDivider);
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

    // Helper methods for car navigation
    getStopLinePosition(direction) {
        return this.stopLines[direction];
    }

    getSpawnPoint(direction) {
        const offset = 300; // Adjust as needed for your canvas
        switch (direction) {
            case 'north': return { x: this.centerX, y: this.centerY - offset };
            case 'south': return { x: this.centerX, y: this.centerY + offset };
            case 'east':  return { x: this.centerX + offset, y: this.centerY };
            case 'west':  return { x: this.centerX - offset, y: this.centerY };
            default: return undefined;
        }
    }

    getExitPoint(direction) {
        const offset = 300; // Adjust as needed for your canvas
        switch (direction) {
            case 'north': return { x: this.centerX, y: this.centerY - offset };
            case 'south': return { x: this.centerX, y: this.centerY + offset };
            case 'east':  return { x: this.centerX + offset, y: this.centerY };
            case 'west':  return { x: this.centerX - offset, y: this.centerY };
            default: return undefined;
        }
    }
getLightPosition(direction) {
    if (!direction || typeof direction !== 'string') {
        console.warn("Invalid direction for getLightPosition:", direction);
        return undefined;
    }
    return this.lightPositions[direction];
}

    // Check if a point is within the intersection
    isInIntersection(x, y) {
        const halfRoad = this.roadWidth / 2;
        return (
            x >= this.centerX - halfRoad &&
            x <= this.centerX + halfRoad &&
            y >= this.centerY - halfRoad &&
            y <= this.centerY + halfRoad
        );
    }

    // Get proper exit point based on turn type to ensure correct lane usage
    // ...existing code...
    getProperExitPoint(fromDirection, toDirection, turnType) {
        const laneOffset = this.laneWidth / 2;

        // Improved turn logic based on your description
        // Removed turning logic
        return this.exitPoints[toDirection];
    }
// ...existing code...

    // Get turning path for straight-line turns (no curves)
    getTurningPath(fromDirection, toDirection, turnType) {
        // For straight corners, cars just need entry and exit points
        return [this.getPathEntryPoint(fromDirection), this.exitPoints[toDirection]];
    }

    getPathEntryPoint(direction) {
        const halfRoad = this.roadWidth / 2;
        const laneOffset = this.laneWidth / 2;
        
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

    // Method to provide car manager reference to cars
    setCarManager(carManager) {
        this.carManager = carManager;
    }
    
    getAllCars() {
        return this.carManager ? this.carManager.getCars() : [];
    }

}

// Example usage
// ...existing code...