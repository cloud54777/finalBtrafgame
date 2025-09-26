import { CONFIG } from "./config.js";
import { utils } from './utils.js';

export class Car {
    constructor({ id, direction, intersection, route = null, lane = 0 }) {
        this.id = id;
        this.fromDirection = direction;
        this.intersection = intersection;
        this.route = route || [direction, 'intersection', this.calculateToDirection()];
        this.lane = lane; // 0 = lane for one direction, 1 = lane for opposite direction
        this.lateralPosition = 0; // 0 = center of lane
        this.turnType = this.calculateTurnType();
        this.toDirection = this.route[2];

        
        // Position and movement
        const spawnPoint = intersection.getSpawnPointForLane(direction, lane);
        this.x = spawnPoint.x;
        this.y = spawnPoint.y;
        this.angle = this.getInitialAngle();

        // Properties
        this.speed = 0;
        this.maxSpeed = CONFIG.DEFAULT_SETTINGS.CAR_SPEED;
        this.width = CONFIG.CAR_WIDTH;
        this.height = CONFIG.CAR_HEIGHT;
        this.color = CONFIG.CAR_COLORS[Math.floor(Math.random() * CONFIG.CAR_COLORS.length)];

        // State
        this.state = 'approaching'; // approaching, waiting, crossing, turning, exiting, completed
        this.waitStartTime = null;
        this.totalWaitTime = 0;
        this.isInIntersection = false;
        this.pathProgress = 0;
        this.turnStartTime = null;
        this.isHidden = false;

        // Calculate target position for movement
        this.calculateTargetPosition();
    }

    calculateTurnType() {
        // For now, all cars go straight since lanes are for bidirectional traffic
        return CONFIG.TURN_TYPES.STRAIGHT;
    }

    prepareForTurn() {
        // Tactical lane change before intersection
        if (this.turnType === 'left') this.lane = 0;
        else if (this.turnType === 'right') this.lane = 1;
        // For straight, stay in current lane
    }

    updateApproaching(dt, lightStates) {
        this.prepareForTurn();
        // ...existing code...
        // ...existing code...
    }

    updateCrossing(dt) {
        // Accelerate through intersection
        this.speed = Math.min(this.maxSpeed * 1.2, this.speed + 40 * dt);
        // Move along trajectory
        if (this.turnType === 'left' || this.turnType === 'right') {
            this.followTurnTrajectory(dt);
        } else {
            // Straight
            this.x += Math.cos(this.angle) * this.speed * dt;
            this.y += Math.sin(this.angle) * this.speed * dt;
        }
        // Check if we've exited the intersection
        if (!this.isInIntersection && this.pathProgress > 0) {
            this.state = 'exiting';
        }
        this.pathProgress += dt;
    }

    followTurnTrajectory(dt) {
        // Use Bezier curve for left/right turns
        const entry = this.intersection.getPathEntryPoint(this.fromDirection);
        const exit = this.intersection.exitPoints[this.toDirection];
        // Control points for Bezier (simple: entry, control1, control2, exit)
        let control1, control2;
        if (this.turnType === 'left') {
            control1 = { x: entry.x - 60, y: entry.y + 60 };
            control2 = { x: exit.x - 60, y: exit.y - 60 };
        } else {
            control1 = { x: entry.x + 60, y: entry.y - 60 };
            control2 = { x: exit.x + 60, y: exit.y + 60 };
        }
        const t = Math.min(this.pathProgress / 1.2, 1); // 1.2s for full turn
        const pt = utils.getBezierPoint(t, entry, control1, control2, exit);
        this.x = pt.x;
        this.y = pt.y;
        // Update heading
        if (t < 1) {
            const nextT = Math.min(t + 0.05, 1);
            const nextPt = utils.getBezierPoint(nextT, entry, control1, control2, exit);
            this.angle = utils.getAngle(this.x, this.y, nextPt.x, nextPt.y);
        }
    }

    calculateToDirection() {
        // All cars go straight through (opposite direction)
        const directions = [CONFIG.DIRECTIONS.NORTH, CONFIG.DIRECTIONS.EAST, CONFIG.DIRECTIONS.SOUTH, CONFIG.DIRECTIONS.WEST];
        const currentIndex = directions.indexOf(this.fromDirection);
        return directions[(currentIndex + 2) % 4]; // Always go straight (opposite direction)
    }

    getInitialAngle() {
        switch (this.fromDirection) {
            case CONFIG.DIRECTIONS.NORTH: return Math.PI / 2; // Facing south (down)
            case CONFIG.DIRECTIONS.EAST: return Math.PI; // Facing west (left)
            case CONFIG.DIRECTIONS.SOUTH: return -Math.PI / 2; // Facing north (up)
            case CONFIG.DIRECTIONS.WEST: return 0; // Facing east (right)
            default: return 0;
        }
    }
calculateTargetPosition() {
    // Make sure intersection and fromDirection are valid
    if (this.intersection && typeof this.intersection.getExitPoint === 'function' && this.fromDirection) {
        const target = this.intersection.getExitPoint(this.fromDirection);
        if (!target || typeof target.x !== 'number' || typeof target.y !== 'number') {
            console.warn("Target position is undefined or invalid for car", this.id);
            return;
        }
        this.targetX = target.x;
        this.targetY = target.y;
    } else {
        console.warn("intersection.getExitPoint is not a function or direction is missing");
    }
}

    update(deltaTime, lightStates) {
        const dt = deltaTime / 1000; // Convert to seconds

        switch (this.state) {
            case 'approaching':
                this.updateApproaching(dt, lightStates);
                break;
            case 'waiting':
                this.updateWaiting(dt, lightStates);
                break;
            case 'crossing':
                this.updateCrossing(dt);
                break;
            case 'turning':
                this.updateTurning(dt);
                break;
            case 'exiting':
                this.updateExiting(dt);
                break;
        }

        // Update position based on speed and direction (keep cars in straight lines)
        if (this.speed > 0 && !this.isHidden) {
            // Move based on the angle the car is facing
            this.x += Math.cos(this.angle) * this.speed * dt;
            this.y += Math.sin(this.angle) * this.speed * dt;
        }

        // Check if car is in intersection
        this.isInIntersection = this.intersection.isInIntersection(this.x, this.y);
    }

    updateApproaching(dt, lightStates) {
        const stopLine = this.intersection.getStopLinePosition(this.fromDirection);
        const distanceToStop = this.getDistanceToStopLine(stopLine);
        
        // Check for cars ahead to maintain spacing
        const carAhead = this.checkForCarAhead();
        const shouldStop = carAhead && this.getDistanceToCarAhead(carAhead) < 35;
        
        if (distanceToStop <= 30 || shouldStop) {
            // Close to stop line, check if we should stop
            if (lightStates[this.fromDirection] === CONFIG.LIGHT_STATES.RED || shouldStop) {
                this.state = 'waiting';
                this.speed = 0;
                if (!shouldStop) {
                    this.waitStartTime = Date.now();
                }
                return;
            }
        }
        
        // Continue approaching
        this.speed = Math.min(this.maxSpeed, this.speed + 30 * dt); // Gradual acceleration
        
        // Check if we've reached the intersection
        if (this.isInIntersection) {
            this.state = 'crossing';
        }
    }

    updateWaiting(dt, lightStates) {
        this.speed = 0;
        
        if (this.waitStartTime) {
            this.totalWaitTime = Date.now() - this.waitStartTime;
        }
        
        // Check if light turned green
        if (lightStates[this.fromDirection] === CONFIG.LIGHT_STATES.GREEN || 
            lightStates[this.fromDirection] === CONFIG.LIGHT_STATES.YELLOW) {
            this.state = 'crossing';
            this.waitStartTime = null;
        }
    }

    updateCrossing(dt) {
        // Accelerate through intersection
        this.speed = Math.min(this.maxSpeed * 1.2, this.speed + 40 * dt);
        
        // Check if we need to turn or go straight
        if (this.turnType !== CONFIG.TURN_TYPES.STRAIGHT) {
            // Check if we've reached the intersection center
            const centerX = this.intersection.centerX;
            const centerY = this.intersection.centerY;
            const distanceToCenter = Math.sqrt(
                Math.pow(this.x - centerX, 2) + Math.pow(this.y - centerY, 2)
            );
            
            if (distanceToCenter < 20) { // Close enough to center
                this.state = 'turning';
                this.turnStartTime = Date.now();
                this.isHidden = true;
                this.speed = 0;
                return;
            }
        } else {
            // Straight through - check if we've exited the intersection
            if (!this.isInIntersection && this.pathProgress > 0) {
                this.state = 'exiting';
            }
        }
        
        this.pathProgress += dt;
    }

    updateTurning(dt) {
        // Wait for turn delay
        const turnDelay = CONFIG.TURN_DELAYS[this.turnType] || 0;
        const elapsedTime = Date.now() - this.turnStartTime;
        
        if (elapsedTime >= turnDelay) {
            // Teleport to exit position
            const exitInfo = this.getExitPosition(this.fromDirection, this.turnType, this.lane);
            this.x = exitInfo.x;
            this.y = exitInfo.y;
            this.angle = this.degreesToRadians(exitInfo.heading);
            this.fromDirection = exitInfo.direction;
            
            // Resume movement
            this.isHidden = false;
            this.speed = this.maxSpeed;
            this.state = 'exiting';
            this.turnStartTime = null;
        }
    }

    getExitPosition(fromDirection, turnType, lane) {
        const cx = this.intersection.centerX;
        const cy = this.intersection.centerY;
        const roadWidth = CONFIG.ROAD_WIDTH;
        const laneWidth = CONFIG.LANE_WIDTH;
        const intersectionSize = CONFIG.INTERSECTION_SIZE;
        
        // Calculate lane offset from road center
        const laneOffset = (lane - 0.5) * laneWidth;
        const roadDistance = intersectionSize / 2 + 10; // Distance from center to road edge
        
        let exitDirection, x, y, heading;
        
        switch (fromDirection) {
            case CONFIG.DIRECTIONS.NORTH:
                switch (turnType) {
                    case CONFIG.TURN_TYPES.STRAIGHT:
                        exitDirection = CONFIG.DIRECTIONS.SOUTH;
                        x = cx + laneOffset;
                        y = cy + roadDistance;
                        heading = CONFIG.HEADINGS.SOUTH;
                        break;
                    case CONFIG.TURN_TYPES.LEFT:
                        exitDirection = CONFIG.DIRECTIONS.EAST;
                        x = cx + roadDistance;
                        y = cy + laneOffset;
                        heading = CONFIG.HEADINGS.EAST;
                        break;
                    case CONFIG.TURN_TYPES.RIGHT:
                        exitDirection = CONFIG.DIRECTIONS.WEST;
                        x = cx - roadDistance;
                        y = cy - laneOffset;
                        heading = CONFIG.HEADINGS.WEST;
                        break;
                }
                break;
                
            case CONFIG.DIRECTIONS.SOUTH:
                switch (turnType) {
                    case CONFIG.TURN_TYPES.STRAIGHT:
                        exitDirection = CONFIG.DIRECTIONS.NORTH;
                        x = cx - laneOffset;
                        y = cy - roadDistance;
                        heading = CONFIG.HEADINGS.NORTH;
                        break;
                    case CONFIG.TURN_TYPES.LEFT:
                        exitDirection = CONFIG.DIRECTIONS.WEST;
                        x = cx - roadDistance;
                        y = cy - laneOffset;
                        heading = CONFIG.HEADINGS.WEST;
                        break;
                    case CONFIG.TURN_TYPES.RIGHT:
                        exitDirection = CONFIG.DIRECTIONS.EAST;
                        x = cx + roadDistance;
                        y = cy + laneOffset;
                        heading = CONFIG.HEADINGS.EAST;
                        break;
                }
                break;
                
            case CONFIG.DIRECTIONS.EAST:
                switch (turnType) {
                    case CONFIG.TURN_TYPES.STRAIGHT:
                        exitDirection = CONFIG.DIRECTIONS.WEST;
                        x = cx - roadDistance;
                        y = cy + laneOffset;
                        heading = CONFIG.HEADINGS.WEST;
                        break;
                    case CONFIG.TURN_TYPES.LEFT:
                        exitDirection = CONFIG.DIRECTIONS.NORTH;
                        x = cx - laneOffset;
                        y = cy - roadDistance;
                        heading = CONFIG.HEADINGS.NORTH;
                        break;
                    case CONFIG.TURN_TYPES.RIGHT:
                        exitDirection = CONFIG.DIRECTIONS.SOUTH;
                        x = cx + laneOffset;
                        y = cy + roadDistance;
                        heading = CONFIG.HEADINGS.SOUTH;
                        break;
                }
                break;
                
            case CONFIG.DIRECTIONS.WEST:
                switch (turnType) {
                    case CONFIG.TURN_TYPES.STRAIGHT:
                        exitDirection = CONFIG.DIRECTIONS.EAST;
                        x = cx + roadDistance;
                        y = cy - laneOffset;
                        heading = CONFIG.HEADINGS.EAST;
                        break;
                    case CONFIG.TURN_TYPES.LEFT:
                        exitDirection = CONFIG.DIRECTIONS.SOUTH;
                        x = cx + laneOffset;
                        y = cy + roadDistance;
                        heading = CONFIG.HEADINGS.SOUTH;
                        break;
                    case CONFIG.TURN_TYPES.RIGHT:
                        exitDirection = CONFIG.DIRECTIONS.NORTH;
                        x = cx - laneOffset;
                        y = cy - roadDistance;
                        heading = CONFIG.HEADINGS.NORTH;
                        break;
                }
                break;
        }
        
        return { direction: exitDirection, x, y, heading };
    }

    degreesToRadians(degrees) {
        return (degrees * Math.PI) / 180;
    }

    getTargetExitAngle() {
        switch (this.toDirection) {
            case CONFIG.DIRECTIONS.NORTH: return -Math.PI / 2; // Facing up
            case CONFIG.DIRECTIONS.EAST: return 0; // Facing right
            case CONFIG.DIRECTIONS.SOUTH: return Math.PI / 2; // Facing down
            case CONFIG.DIRECTIONS.WEST: return Math.PI; // Facing left
            default: return this.angle;
        }
    }

    updateExiting(dt) {
        // Assign lane after turn
        if (this.turnType === 'left') this.lane = 0;
        else if (this.turnType === 'right') this.lane = 1;
        // For straight, keep lane
        this.lateralPosition = 0; // Center in lane

        // Update route to next segment (simulate route progression)
        if (this.route && this.route.length > 1) {
            this.route = this.route.slice(1);
        }

        // Continue moving at normal speed in the direction we're facing
        this.speed = this.maxSpeed;

        // Check if we've reached the edge of the canvas
        let hasExited = false;

        // Check if car has exited based on canvas boundaries
        hasExited = this.x < -50 || this.x > CONFIG.CANVAS_WIDTH + 50 || 
                   this.y < -50 || this.y > CONFIG.CANVAS_HEIGHT + 50;

        if (hasExited) {
            this.state = 'completed';
        }
    }

    getDistanceToStopLine(stopLine) {
        // Calculate distance from car to stop line
        switch (this.fromDirection) {
            case CONFIG.DIRECTIONS.NORTH:
                return Math.abs(this.y - stopLine.y1);
            case CONFIG.DIRECTIONS.EAST:
                return Math.abs(this.x - stopLine.x1);
            case CONFIG.DIRECTIONS.SOUTH:
                return Math.abs(this.y - stopLine.y1);
            case CONFIG.DIRECTIONS.WEST:
                return Math.abs(this.x - stopLine.x1);
            default:
                return 0;
        }
    }

    render(ctx) {
        // Don't render if car is hidden during turn
        if (this.isHidden) return;
        
        ctx.save();
        // Move to car position and rotate
        ctx.translate(this.x, this.y);
        ctx.rotate(this.angle);
        // Draw car body
        ctx.fillStyle = this.color;
        ctx.fillRect(-this.width / 2, -this.height / 2, this.width, this.height);
        // Draw car details
        ctx.fillStyle = '#333333';
        ctx.fillRect(-this.width / 2 + 2, -this.height / 2 + 2, this.width - 4, 3); // Windshield
        ctx.fillRect(-this.width / 2 + 2, this.height / 2 - 5, this.width - 4, 3); // Rear window
        ctx.restore();
    }

    // Getters for external systems
    isWaiting() {
        return this.state === 'waiting';
    }

    isCompleted() {
        return this.state === 'completed';
    }

    getWaitTime() {
        return this.totalWaitTime;
    }

    getDirection() {
        return this.fromDirection;
    }

    checkForCarAhead() {
        // Get all cars from the car manager through intersection
        const allCars = this.intersection.carManager ? this.intersection.carManager.getCars() : [];
        
        let closestCar = null;
        let closestDistance = Infinity;
        
        for (const otherCar of allCars) {
            if (otherCar.id === this.id || otherCar.fromDirection !== this.fromDirection) {
                continue; // Skip self, cars from different directions, and cars in different lanes
            }
            
            // Check if the other car is ahead of this car
            let isAhead = false;
            let distance = 0;
            
            switch (this.fromDirection) {
                case CONFIG.DIRECTIONS.NORTH:
                    isAhead = otherCar.y > this.y;
                    distance = otherCar.y - this.y;
                    break;
                case CONFIG.DIRECTIONS.EAST:
                    isAhead = otherCar.x < this.x;
                    distance = this.x - otherCar.x;
                    break;
                case CONFIG.DIRECTIONS.SOUTH:
                    isAhead = otherCar.y < this.y;
                    distance = this.y - otherCar.y;
                    break;
                case CONFIG.DIRECTIONS.WEST:
                    isAhead = otherCar.x > this.x;
                    distance = otherCar.x - this.x;
                    break;
            }
            
            if (isAhead && distance > 0 && distance < closestDistance) {
                closestDistance = distance;
                closestCar = otherCar;
            }
        }
        
        return closestCar;
    }

    getDistanceToCarAhead(carAhead) {
        if (!carAhead) return Infinity;
        
        switch (this.fromDirection) {
            case CONFIG.DIRECTIONS.NORTH:
                return carAhead.y - this.y;
            case CONFIG.DIRECTIONS.EAST:
                return this.x - carAhead.x;
            case CONFIG.DIRECTIONS.SOUTH:
                return this.y - carAhead.y;
            case CONFIG.DIRECTIONS.WEST:
                return carAhead.x - this.x;
            default:
                return Infinity;
        }
    }

    // ...existing code...
}

export class CarManager {
    constructor(intersection) {
        this.intersection = intersection;
        this.cars = [];
        this.nextCarId = 1;
        this.spawnTimer = 0;
        this.settings = { ...CONFIG.DEFAULT_SETTINGS };
        
        // Callbacks
        this.onCarCompleted = null;
        
        // Set reference in intersection for car-to-car communication
        this.intersection.carManager = this;
    }

    initialize(settings) {
        this.settings = { ...settings };
        this.cars = [];
        this.nextCarId = 1;
        this.spawnTimer = 0;
    }

    update(deltaTime, lightStates) {
        // Update spawn timer
        this.spawnTimer += deltaTime;
        
        // Spawn new cars
        const spawnInterval = (10000 / this.settings.CAR_SPAWN_RATE); // Convert rate to interval
        if (this.spawnTimer >= spawnInterval) {
            this.spawnCar();
            this.spawnTimer = 0;
        }

        // Update existing cars
        this.cars.forEach(car => {
            car.maxSpeed = this.settings.CAR_SPEED;
            car.update(deltaTime, lightStates);
        });

        // Remove completed cars
        const completedCars = this.cars.filter(car => car.isCompleted());
        completedCars.forEach(car => {
            if (this.onCarCompleted) {
                this.onCarCompleted(car);
            }
        });

        this.cars = this.cars.filter(car => !car.isCompleted());
    }

    spawnCar() {
        // Randomly choose a direction to spawn from
        const directions = [CONFIG.DIRECTIONS.NORTH, CONFIG.DIRECTIONS.EAST, CONFIG.DIRECTIONS.SOUTH, CONFIG.DIRECTIONS.WEST];
        const direction = directions[Math.floor(Math.random() * directions.length)];
        
        // Randomly choose a lane (0 or 1)
        const lane = Math.floor(Math.random() * 2);
        
        // Check if there's space to spawn (no car too close to spawn point)
        const spawnPoint = this.intersection.spawnPoints[direction];
        const tooClose = this.cars.some(car => {
            const distance = utils.getDistance(car.x, car.y, spawnPoint.x, spawnPoint.y);
            return car.fromDirection === direction && distance < 60;
        });

        if (!tooClose) {
            const car = new Car({
                id: this.nextCarId++,
                direction: direction,
                intersection: this.intersection,
                lane: lane
            });
            this.cars.push(car);
        }
    }

    render(ctx) {
        this.cars.forEach(car => car.render(ctx));
    }

    reset() {
        this.cars = [];
        this.nextCarId = 1;
        this.spawnTimer = 0;
    }

    updateSettings(settings) {
        this.settings = { ...settings };
    }

    // Getters for external systems
    getCars() {
        return [...this.cars];
    }

    getWaitingCars(direction) {
        return this.cars.filter(car => car.getDirection() === direction && car.isWaiting());
    }

    getCurrentCarCount() {
        return this.cars.length;
    }
}