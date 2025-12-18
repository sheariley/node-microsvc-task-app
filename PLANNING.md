# High-level Plan and Architecture

## Goal
Build a task management app composed of containerized micro-services that allows the users to manage their task list.

## Architecture
- Use node.js, Express, and Mongoose to create web API endpoints
- Use MongoDB for the database(s) backing the web APIs
- Everything will run in containers
  - Use docker-compose to orchestrate container pod and integrate the various individual containers

### User Service
- Workspace source location: ./user-service
- Stack
  - Express + Mongoose: Users Web API server
  - MongoDB: Users database
- Routes
  - GET /ping - Health check for container auto-restart
  - GET /users - fetch all users
  - GET /users/:userId - fetch user by ID
  - POST /users - Create new user

## Task Service
- Stack
  - Express + Mongoose: Tasks Web API server
  - MongoDB: Users database
- Routes
  - GET /ping - Health check for container auto-restart
  - GET /users/:userId/tasks - List all tasks for a user
  - GET /users/:userId/tasks/:taskId - Get single task by ID for a user
  - POST /users/:userId/tasks - Create task for user
  - PUT /users/:userId/tasks/:taskId - Update a task for a user
