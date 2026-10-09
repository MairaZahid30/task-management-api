# Task Management REST API

A simple Task Management REST API built with Node.js, Express.js, and PostgreSQL. This project allows users to manage their projects and tasks through API requests.

## Features

- User registration and login
- Secure password storage using bcrypt
- JWT-based authentication
- Create, view, update, and delete projects
- Create, view, update, and delete tasks
- Search and filter tasks
- Sort and paginate task results
- Find overdue tasks
- View dashboard statistics
- Store and manage data using PostgreSQL

## Technologies Used

- Node.js
- Express.js
- PostgreSQL
- JSON Web Token (JWT)
- bcryptjs
- Postman

## Getting Started

Follow these steps to run the project on your computer.

### 1. Clone the Repository

Download or clone this repository to your computer, then open the project folder in your terminal.

### 2. Install Dependencies

Run the following command:

    npm install

### 3. Set Up the Database

Create a PostgreSQL database named `task_management_db`.

The required tables will be created automatically when the server starts.

### 4. Configure Environment Variables

Create a `.env` file in the project's root directory and add your own database credentials and JWT secret.

Example:

    DB_USER=postgres
    DB_HOST=localhost
    DB_NAME=task_management_db
    DB_PASSWORD=your_postgres_password
    DB_PORT=5432
    JWT_SECRET=your_private_secret

Replace the example values with your actual configuration. Keep your `.env` file private and never upload it to GitHub.

### 5. Start the Server

Run:

    npm start

The server will start at:

    http://localhost:5001

## API Endpoints

### Authentication
- `POST /auth/register` — Register a new user.
- `POST /auth/login` — Log in and receive a JWT token.

### Users
- `GET /users/me` — View your account details.
- `PATCH /users/me` — Update your account details.
- `DELETE /users/me` — Delete your account.

### Projects
- `POST /projects` — Create a project.
- `GET /projects` — View your projects.
- `GET /projects/:id` — View a specific project.
- `PATCH /projects/:id` — Update a project.
- `DELETE /projects/:id` — Delete a project.

### Tasks
- `POST /tasks` — Create a task.
- `GET /tasks` — View tasks, with options for filtering, searching, sorting, and pagination.
- `GET /tasks/:id` — View a specific task.
- `PATCH /tasks/:id` — Update a task.
- `DELETE /tasks/:id` — Delete a task.
- `GET /tasks/overdue` — View overdue tasks.

### Dashboard
- `GET /dashboard` — View task statistics, including total, completed, pending, and overdue tasks.

## Authentication

Most endpoints require authentication.

First, log in using `/auth/login` to receive a JWT token. Then, include that token in the Authorization header when accessing protected endpoints.

Use this format:

    Authorization: Bearer YOUR_JWT_TOKEN

## Testing

The API endpoints can be tested using Postman.

## Project Goal

The goal of this project is to practice building REST APIs, working with a PostgreSQL database, handling authentication, and managing related data using Express.js.
