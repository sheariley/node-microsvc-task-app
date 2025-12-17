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
  - GET /users - fetch all users
  - POST /users - Create new user

## Task Service
- Stack
  - Express + Mongoose: Tasks Web API server
  - MongoDB: Users database
- Routes
  - 