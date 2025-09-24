import { CONFIG } from "./config.js";
import { utils } from './utils.js';

export class Car {
    constructor({ id, direction, intersection, route = null, lane = 0, roadId = null }) {
        this.id = id;
        this.fromDirection = direction;
        this.intersection = intersection;
        this.route = route || [direction, 'intersection', this.calculateToDirection()];
        this.lane = lane; // 0 = lane for one direction, 1 = lane for opposite direction
        this.lateralPosition = 0; // 0 = center of lane
        this.turnType = this.calculateTurnType();
        this.toDirection = this.route[2];
        
        // Physical positioning system
        this.roadId = roadId || this.getRoadIdFromDirection(direction);
        this.u = 0; // Longitudinal position (arc length along road centerline)
        this.v = lane; // Lateral position (lane index)
        this.dvdt = 0; // Lane change rate
        this.len = CONFIG.CAR_LENGTH; // Vehicle length in meters

        
        // Position and movement
        const spawnPoint = intersection.getSpawnPointForLane(direction, lane);
        this.x = spawnPoint.x;
        this.y = spawnPoint.y;
        this.angle = this.getInitialAngle();

        // Properties
        this.speed = 0;
        this.maxSpeed = CONFIG.DEFAULT_SETTINGS.CAR_SPEED * CONFIG.LANE_WIDTH; // Convert to meters/second
        this.width = CONFIG.CAR_WIDTH / CONFIG.LANE_WIDTH; // Normalize to lane widths
        this.height = CONFIG.CAR_HEIGHT / CONFIG.LANE_WIDTH; // Normalize to lane widths
        this.color = CONFIG.CAR_COLORS[Math.floor(Math.random() * CONFIG.CAR_COLORS.length)];

        // State
        this.state = 'approaching'; // approaching, waiting, crossing, turning, exiting, completed
        this.waitStartTime = null;
        this.totalWaitTime = 0;
        this.isInIntersection = false;
        this.pathProgress = 0;
        this.turnStartTime = null;
        this.isHidden = false;
        
        // Initialize physical position
        this.initializePhysicalPosition();

        // Calculate target position for movement
        this.calculateTargetPosition();
    }
    
    getRoadIdFromDirection(direction) {
        switch (direction) {
            case CONFIG.DIRECTIONS.EAST: return CONFIG.ROAD_IDS.EAST_BOUND;
            case CONFIG.DIRECTIONS.WEST: return CONFIG.ROAD_IDS.WEST_BOUND;
            case CONFIG.DIRECTIONS.NORTH: return CONFIG.ROAD_IDS.NORTH_BOUND;
            case CONFIG.DIRECTIONS.SOUTH: return CONFIG.ROAD_IDS.SOUTH_BOUND;
            default: return 0;
        }
    }
    
    initializePhysicalPosition() {
        // Set initial u position based on spawn point
        this.u = 10; // Start 10 meters from road beginning
        this.v = this.lane; // Lane position
        
        // Update pixel coordinates from physical position
        this.updatePixelPosition();
    }
    
    updatePixelPosition() {
        const pos = this.intersection.getVehiclePosition(this.roadId, this.u, this.v);
        if (pos) {
            this.x = pos.x;
            this.y = pos.y;
            this.angle = this.intersection.getVehicleOrientation(this.roadId, this.u, this.dvdt, this.speed);
        }
    }

    calculateTurnType() {
        // Determine turn type based on lane and random chance
        const turnChance = Math.random();
        if (turnChance < CONFIG.DEFAULT_SETTINGS.TURN_RATE / 2) {
            return CONFIG.TURN_TYPES.LEFT;
        } else if (turnChance < CONFIG.DEFAULT_SETTINGS.TURN_RATE) {
            return CONFIG.TURN_TYPES.RIGHT;
        }
        return CONFIG.TURN_TYPES.STRAIGHT;
    }

    prepareForTurn() {
        // Tactical lane change before intersection
        if (this.turnType === 'left') this.lane = 0;
        else if (this.turnType === 'right') this.lane = 1;
        // For straight, stay in current lane
    }

    calculateToDirection() {
        // Calculate destination based on turn type
        const directions = [CONFIG.DIRECTIONS.NORTH, CONFIG.DIRECTIONS.EAST, CONFIG.DIRECTIONS.SOUTH, CONFIG.DIRECTIONS.WEST];
        const currentIndex = directions.indexOf(this.fromDirection);
        
        switch (this.turnType) {
            case CONFIG.TURN_TYPES.LEFT:
                return directions[(currentIndex + 1) % 4]; // Turn left
            case CONFIG.TURN_TYPES.RIGHT:
                return directions[(currentIndex + 3) % 4]; // Turn right
            default:
                return directions[(currentIndex + 2) % 4]; // Go straight
        }
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
        
        // Update physical position first
        this.updatePhysicalMovement(dt, lightStates);
        
        // Update pixel position from physical coordinates
        this.updatePixelPosition();
        
        // Check intersection status
        this.isInIntersection = this.intersection.isInIntersection(this.x, this.y);
    }
    
    updatePhysicalMovement(dt, lightStates) {
        const road = this.intersection.roads[this.roadId];
        if (!road) return;

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
        
        // Update longitudinal position
        if (this.speed > 0 && !this.isHidden) {
            this.u += this.speed * dt; // Move along road centerline
        }
        
        // Update lateral position for lane changes
        if (Math.abs(this.dvdt) > 0.001) {
            this.v += this.dvdt * dt;
            this.v = Math.max(0, Math.min(road.nLanes - 1, this.v)); // Keep in valid lanes
        }
    }

    updateApproaching(dt, lightStates) {
        this.prepareForTurn();
        
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
        this.speed = Math.min(this.maxSpeed, this.speed + 10 * dt); // Gradual acceleration in m/s
        
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
        // Check if we need to follow alternative trajectory for turns
        if (this.turnType !== CONFIG.TURN_TYPES.STRAIGHT) {
            this.followAlternativeTrajectory(dt);
        } else {
            // Accelerate through intersection for straight movement
            this.speed = Math.min(this.maxSpeed * 1.2, this.speed + 15 * dt);
        }
        
        // Check if we've exited the intersection
        if (!this.isInIntersection && this.pathProgress > 0) {
            this.state = 'exiting';
        }
        
        this.pathProgress += dt;
    }
    
    followAlternativeTrajectory(dt) {
        const road = this.intersection.roads[this.roadId];
        const altTraj = road.trajAlt.find(traj => 
            this.u >= traj.umin && this.u <= traj.umax && 
            this.lane >= traj.laneMin && this.lane <= traj.laneMax
        );
        
        if (altTraj) {
            // Switch to alternative trajectory
            this.roadId = altTraj.roadID;
            this.u = altTraj.umin; // Reset position for new road
            this.speed = Math.min(this.maxSpeed * 0.8, this.speed); // Slow down for turn
        }
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
        // Continue moving at normal speed in the direction we're facing
        this.speed = this.maxSpeed;

        // Check if we've reached the end of the current road
        const road = this.intersection.roads[this.roadId];
        const hasExited = road && this.u >= road.roadLen;

        if (hasExited) {
            this.state = 'completed';
        }
    }

    getDistanceToStopLine(stopLine) {
        // Calculate distance based on physical position
        const road = this.intersection.roads[this.roadId];
        if (!road) return 0;
        
        // Distance to intersection entry point (approximately at u = 100m)
        const intersectionEntry = 100;
        return Math.max(0, intersectionEntry - this.u);
    }

    render(ctx) {
        // Don't render if car is hidden during turn
        if (this.isHidden) return;
        
        // Scale dimensions for rendering
        const renderWidth = this.width * CONFIG.LANE_WIDTH;
        const renderHeight = this.height * CONFIG.LANE_WIDTH;
        
        ctx.save();
        // Move to car position and rotate
        ctx.translate(this.x, this.y);
        ctx.rotate(this.angle);
        // Draw car body
        ctx.fillStyle = this.color;
        ctx.fillRect(-renderWidth / 2, -renderHeight / 2, renderWidth, renderHeight);
        // Draw car details
        ctx.fillStyle = '#333333';
        ctx.fillRect(-renderWidth / 2 + 2, -renderHeight / 2 + 2, renderWidth - 4, 3); // Windshield
        ctx.fillRect(-renderWidth / 2 + 2, renderHeight / 2 - 5, renderWidth - 4, 3); // Rear window
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
            if (otherCar.id === this.id || otherCar.roadId !== this.roadId) {
                continue; // Skip self and cars from different directions
            }
            
            // Check if the other car is ahead based on u position
            const isAhead = otherCar.u > this.u;
            const distance = otherCar.u - this.u;
            
            if (isAhead && distance > 0 && distance < closestDistance) {
                closestDistance = distance;
                closestCar = otherCar;
            }
        }
        
        return closestCar;
    }

    getDistanceToCarAhead(carAhead) {
        if (!carAhead) return Infinity;
        
        // Distance based on physical u position
        return Math.abs(carAhead.u - this.u);
    }
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
                lane: lane,
                roadId: this.getRoadIdFromDirection(direction)
            });
            this.cars.push(car);
        }
    }
    
    getRoadIdFromDirection(direction) {
        switch (direction) {
            case CONFIG.DIRECTIONS.EAST: return CONFIG.ROAD_IDS.EAST_BOUND;
            case CONFIG.DIRECTIONS.WEST: return CONFIG.ROAD_IDS.WEST_BOUND;
            case CONFIG.DIRECTIONS.NORTH: return CONFIG.ROAD_IDS.NORTH_BOUND;
            case CONFIG.DIRECTIONS.SOUTH: return CONFIG.ROAD_IDS.SOUTH_BOUND;
            default: return 0;
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