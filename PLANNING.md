# High-level Plan and Architecture

## Goal

Build a task management app composed of containerized micro-services that allows the users to manage their task list.

## Architecture

- Use node.js, Express, and Mongoose to create web API endpoints
- Use TypeScript for type-safety
- Use zod for client and server user input validation
- Use MongoDB for the database(s) backing the web APIs
- Everything will run in containers
  - Use docker-compose to orchestrate container pod and integrate the various individual containers
- Authentication/Authorization: Use Auth.js (next-auth) to implement OAuth 2.0.
  - Create an API gateway within NextJS web UI for performing auth checks before accessing internal microservice APIs

## Shared DTO library/package

- Defines shared DTO schemas (zod) and types
- Provides validation helper methods for validating DTO instances against zod schemas

## Shared Entity library/package

- Defines shared database entity types and schemas (zod, MongoDB/mongoose)

## Shared Helper Methods and Types library/package

- Provides shared helper methods for connecting to DB and message queue
- Provides misc shared utility methods for things like error handling and async waiting

## User Service

- Workspace source location: ./user-service
- Stack
  - Express + Mongoose: Users Web API server
  - MongoDB: Users database
- Routes
  - GET `/ping` - Health check for container auto-restart
  - GET /users - fetch all users
  - GET /users/:userId - fetch user by ID
  - POST /users - Create new user

## Task Service

- Stack
  - Express + Mongoose: Tasks Web API server
  - MongoDB: Users database
- Routes
  - GET `/ping` - Health check for container auto-restart
  - GET /users/:userId/tasks - List all tasks for a user
  - GET /users/:userId/tasks/:taskId - Get single task by ID for a user
  - POST /users/:userId/tasks - Create task for user
  - PUT /users/:userId/tasks/:taskId - Update a task for a user
  - DELETE /users/:userId/tasks/:taskId - Delete a user's task

## Web UI

- Stack
  - NextJS/React: SSR/SSG, web server
  - HeroUI V2: Low-level UI components
  - TailwindCSS - Styling and theming
- Styling
  - Simple and clean, but still polished and easy on the eyes
  - 1 light and 1 dark theme; defaulting to system preference
- Routes
  - GET - `/api/ping` - Health check for container auto-restart
  - Landing page - `/` - List of tasks with ability to mark tasks as completed, delete tasks, navigate to task detail page
  - Task Detail Page - `/tasks/[taskId]` - Task detail page to view/edit a task
- Source code paths
  - `@/public` - Static files to be copied to server upon deployment
  - `@/lib` - Low-level, shared utility methods and types
  - `@/lib/api-clients` - Web API clients that facilitate the interface between the web UI and the various services (i.e. user-service, task-service, etc...)
  - `@/app/components` - Custom UI components
  - `@/app/styles` - Custom CSS files, if any
  - `@/app/globals.css` - Root CSS file; defines Tailwind CSS variables and theme; imports any custom CSS files from `@/app/styles`
  - `@/app/providers.tsx` - Combines client-side providers to clean up the root layout.
  - `@/app/layout.tsx` - Root layout inherited by all other layouts
  - `@/app/(main)` - Main pages that use the standard layout (`@/app/(main)/layout.tsx`)
  - `@/app/(main)/page.tsx` - Landing page (route: `/`)
  - `@/app/(main)/tasks/[taskId]/page.tsx` - Task detail page (route: `/tasks/[taskId]`)
