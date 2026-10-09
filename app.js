import express from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import pool, { initializeDatabase } from './db.js';

const app = express();
const port = 5001;

app.use(express.json());


// ==================== AUTHENTICATION ====================

// Middleware: checks whether the user has a valid token
function authenticateToken(req, res, next) {
    const authHeader = req.headers.authorization;

    if (!authHeader) {
        return res.status(401).json({
            message: 'Authentication token is required'
        });
    }

    const token = authHeader.split(' ')[1];

    jwt.verify(token, process.env.JWT_SECRET, (error, user) => {
        if (error) {
            return res.status(403).json({
                message: 'Invalid or expired token'
            });
        }

        req.user = user;
        next();
    });
}


// Register a user
app.post('/auth/register', (req, res) => {
    const { name, email, password } = req.body;

    if (!name || !email || !password) {
        return res.status(400).json({
            message: 'Name, email, and password are required'
        });
    }

    if (password.length < 8) {
        return res.status(400).json({
            message: 'Password must be at least 8 characters'
        });
    }

    const hashedPassword = bcrypt.hashSync(password, 10);

    const query = `
        INSERT INTO users (name, email, password)
        VALUES ($1, $2, $3)
        RETURNING id, name, email, created_at
    `;

    pool.query(query, [name, email, hashedPassword], (error, result) => {
        if (error) {
            if (error.code === '23505') {
                return res.status(409).json({
                    message: 'Email already exists'
                });
            }

            return res.status(500).json({
                message: 'Failed to register user'
            });
        }

        res.status(201).json({
            message: 'User registered successfully',
            user: result.rows[0]
        });
    });
});


// Login a user
app.post('/auth/login', (req, res) => {
    const { email, password } = req.body;

    if (!email || !password) {
        return res.status(400).json({
            message: 'Email and password are required'
        });
    }

    pool.query(
        'SELECT * FROM users WHERE email = $1',
        [email],
        (error, result) => {
            if (error) {
                return res.status(500).json({
                    message: 'Login failed'
                });
            }

            if (
                result.rows.length === 0 ||
                !bcrypt.compareSync(password, result.rows[0].password)
            ) {
                return res.status(401).json({
                    message: 'Invalid email or password'
                });
            }

            const user = result.rows[0];

            const token = jwt.sign(
                { id: user.id, email: user.email },
                process.env.JWT_SECRET,
                { expiresIn: '2h' }
            );

            res.json({
                message: 'Login successful',
                token
            });
        }
    );
});


// ==================== USERS ====================

// Get the logged-in user's profile
app.get('/users/me', authenticateToken, (req, res) => {
    pool.query(
        'SELECT id, name, email, created_at FROM users WHERE id = $1',
        [req.user.id],
        (error, result) => {
            if (error) {
                return res.status(500).json({
                    message: 'Failed to fetch user'
                });
            }

            if (result.rows.length === 0) {
                return res.status(404).json({
                    message: 'User not found'
                });
            }

            res.json(result.rows[0]);
        }
    );
});


// Update the logged-in user's profile
app.patch('/users/me', authenticateToken, (req, res) => {
    const { name, email } = req.body;

    if (name === undefined && email === undefined) {
        return res.status(400).json({
            message: 'Provide a name or email to update'
        });
    }

    const query = `
        UPDATE users
        SET
            name = COALESCE($1, name),
            email = COALESCE($2, email)
        WHERE id = $3
        RETURNING id, name, email
    `;

    pool.query(query, [name ?? null, email ?? null, req.user.id],
        (error, result) => {
            if (error) {
                if (error.code === '23505') {
                    return res.status(409).json({
                        message: 'Email already exists'
                    });
                }

                return res.status(500).json({
                    message: 'Failed to update user'
                });
            }

            if (result.rows.length === 0) {
                return res.status(404).json({
                    message: 'User not found'
                });
            }

            res.json({
                message: 'User updated successfully',
                user: result.rows[0]
            });
        }
    );
});


// Delete the logged-in user's account
app.delete('/users/me', authenticateToken, (req, res) => {
    pool.query(
        'DELETE FROM users WHERE id = $1 RETURNING id',
        [req.user.id],
        (error, result) => {
            if (error) {
                return res.status(500).json({
                    message: 'Failed to delete user'
                });
            }

            if (result.rows.length === 0) {
                return res.status(404).json({
                    message: 'User not found'
                });
            }

            res.json({
                message: 'User deleted successfully'
            });
        }
    );
});


// ==================== PROJECTS ====================

// Create a project
app.post('/projects', authenticateToken, (req, res) => {
    const { name, description } = req.body;

    if (!name || !name.trim()) {
        return res.status(400).json({
            message: 'Project name is required'
        });
    }

    const query = `
        INSERT INTO projects (name, description, user_id)
        VALUES ($1, $2, $3)
        RETURNING *
    `;

    pool.query(query, [name.trim(), description ?? null, req.user.id],
        (error, result) => {
            if (error) {
                return res.status(500).json({
                    message: 'Failed to create project'
                });
            }

            res.status(201).json({
                message: 'Project created successfully',
                project: result.rows[0]
            });
        }
    );
});


// Get all projects with task counts (JOIN)
app.get('/projects', authenticateToken, (req, res) => {
    const query = `
        SELECT
            p.id,
            p.name,
            p.description,
            p.created_at,
            COUNT(t.id)::INTEGER AS total_tasks
        FROM projects p
        LEFT JOIN tasks t ON p.id = t.project_id
        WHERE p.user_id = $1
        GROUP BY p.id
        ORDER BY p.created_at DESC
    `;

    pool.query(query, [req.user.id], (error, result) => {
        if (error) {
            return res.status(500).json({
                message: 'Failed to fetch projects'
            });
        }

        res.json(result.rows);
    });
});


// Get one project
app.get('/projects/:id', authenticateToken, (req, res) => {
    const query = `
        SELECT *
        FROM projects
        WHERE id = $1 AND user_id = $2
    `;

    pool.query(query, [req.params.id, req.user.id],
        (error, result) => {
            if (error) {
                return res.status(500).json({
                    message: 'Failed to fetch project'
                });
            }

            if (result.rows.length === 0) {
                return res.status(404).json({
                    message: 'Project not found'
                });
            }

            res.json(result.rows[0]);
        }
    );
});


// Update a project
app.patch('/projects/:id', authenticateToken, (req, res) => {
    const { name, description } = req.body;

    if (name === undefined && description === undefined) {
        return res.status(400).json({
            message: 'Provide a name or description to update'
        });
    }

    if (name !== undefined && !name.trim()) {
        return res.status(400).json({
            message: 'Project name cannot be empty'
        });
    }

    const query = `
        UPDATE projects
        SET
            name = COALESCE($1, name),
            description = COALESCE($2, description)
        WHERE id = $3 AND user_id = $4
        RETURNING *
    `;

    pool.query(
        query,
        [name === undefined ? null : name.trim(),
         description ?? null,
         req.params.id,
         req.user.id],
        (error, result) => {
            if (error) {
                return res.status(500).json({
                    message: 'Failed to update project'
                });
            }

            if (result.rows.length === 0) {
                return res.status(404).json({
                    message: 'Project not found'
                });
            }

            res.json({
                message: 'Project updated successfully',
                project: result.rows[0]
            });
        }
    );
});


// Delete a project
app.delete('/projects/:id', authenticateToken, (req, res) => {
    pool.query(
        `DELETE FROM projects
         WHERE id = $1 AND user_id = $2
         RETURNING id`,
        [req.params.id, req.user.id],
        (error, result) => {
            if (error) {
                return res.status(500).json({
                    message: 'Failed to delete project'
                });
            }

            if (result.rows.length === 0) {
                return res.status(404).json({
                    message: 'Project not found'
                });
            }

            res.json({
                message: 'Project and its tasks deleted successfully'
            });
        }
    );
});


// ==================== TASKS ====================

// Create a task
app.post('/tasks', authenticateToken, (req, res) => {
    const {
        title,
        description,
        status,
        priority,
        due_date,
        project_id
    } = req.body;

    if (!title || !title.trim() || !project_id) {
        return res.status(400).json({
            message: 'Task title and project_id are required'
        });
    }

    if (
        status !== undefined &&
        !['pending', 'in_progress', 'completed'].includes(status)
    ) {
        return res.status(400).json({
            message: 'Invalid task status'
        });
    }

    if (
        priority !== undefined &&
        !['low', 'medium', 'high'].includes(priority)
    ) {
        return res.status(400).json({
            message: 'Invalid task priority'
        });
    }

    const query = `
        INSERT INTO tasks
            (title, description, status, priority, due_date, project_id, user_id)
        SELECT $1, $2, $3, $4, $5, p.id, $7
        FROM projects p
        WHERE p.id = $6 AND p.user_id = $7
        RETURNING *
    `;

    pool.query(
        query,
        [
            title.trim(),
            description ?? null,
            status ?? 'pending',
            priority ?? 'medium',
            due_date ?? null,
            project_id,
            req.user.id
        ],
        (error, result) => {
            if (error) {
                return res.status(500).json({
                    message: 'Failed to create task'
                });
            }

            if (result.rows.length === 0) {
                return res.status(400).json({
                    message: 'Project not found or does not belong to you'
                });
            }

            res.status(201).json({
                message: 'Task created successfully',
                task: result.rows[0]
            });
        }
    );
});


// Get tasks with search, filtering, sorting, and pagination
app.get('/tasks', authenticateToken, (req, res) => {
    const {
        search,
        status,
        priority,
        project_id,
        sort = 'created_at',
        order = 'DESC',
        page = '1',
        limit = '10'
    } = req.query;

    const allowedSort = ['created_at', 'due_date', 'title', 'priority'];
    const allowedOrder = ['ASC', 'DESC'];

    if (!allowedSort.includes(sort)) {
        return res.status(400).json({
            message: 'Invalid sort field'
        });
    }

    if (!allowedOrder.includes(order.toUpperCase())) {
        return res.status(400).json({
            message: 'Order must be ASC or DESC'
        });
    }

    const pageNumber = Number(page);
    const pageSize = Number(limit);

    if (
        !Number.isInteger(pageNumber) || pageNumber < 1 ||
        !Number.isInteger(pageSize) || pageSize < 1 || pageSize > 100
    ) {
        return res.status(400).json({
            message: 'Page must be positive and limit must be between 1 and 100'
        });
    }

    if (
        status && !['pending', 'in_progress', 'completed'].includes(status)
    ) {
        return res.status(400).json({
            message: 'Invalid task status'
        });
    }

    if (priority && !['low', 'medium', 'high'].includes(priority)) {
        return res.status(400).json({
            message: 'Invalid task priority'
        });
    }

    let query = `
        SELECT
            t.*,
            p.name AS project_name,
            u.name AS owner_name
        FROM tasks t
        JOIN projects p ON t.project_id = p.id
        JOIN users u ON t.user_id = u.id
        WHERE t.user_id = $1
    `;

    const values = [req.user.id];

    if (search) {
        values.push(`%${search}%`);
        query += ` AND (t.title ILIKE $${values.length}
                   OR t.description ILIKE $${values.length})`;
    }

    if (status) {
        values.push(status);
        query += ` AND t.status = $${values.length}`;
    }

    if (priority) {
        values.push(priority);
        query += ` AND t.priority = $${values.length}`;
    }

    if (project_id) {
        values.push(project_id);
        query += ` AND t.project_id = $${values.length}`;
    }

    query += ` ORDER BY t.${sort} ${order.toUpperCase()} NULLS LAST`;

    values.push(pageSize);
    query += ` LIMIT $${values.length}`;

    values.push((pageNumber - 1) * pageSize);
    query += ` OFFSET $${values.length}`;

    pool.query(query, values, (error, result) => {
        if (error) {
            return res.status(500).json({
                message: 'Failed to fetch tasks'
            });
        }

        res.json({
            page: pageNumber,
            limit: pageSize,
            tasks: result.rows
        });
    });
});


// Get overdue tasks
app.get('/tasks/overdue', authenticateToken, (req, res) => {
    const query = `
        SELECT *
        FROM tasks
        WHERE user_id = $1
          AND due_date < CURRENT_DATE
          AND status != 'completed'
        ORDER BY due_date ASC
    `;

    pool.query(query, [req.user.id], (error, result) => {
        if (error) {
            return res.status(500).json({
                message: 'Failed to fetch overdue tasks'
            });
        }

        res.json(result.rows);
    });
});


// Get one task
app.get('/tasks/:id', authenticateToken, (req, res) => {
    const query = `
        SELECT t.*, p.name AS project_name
        FROM tasks t
        JOIN projects p ON t.project_id = p.id
        WHERE t.id = $1 AND t.user_id = $2
    `;

    pool.query(query, [req.params.id, req.user.id],
        (error, result) => {
            if (error) {
                return res.status(500).json({
                    message: 'Failed to fetch task'
                });
            }

            if (result.rows.length === 0) {
                return res.status(404).json({
                    message: 'Task not found'
                });
            }

            res.json(result.rows[0]);
        }
    );
});


// Update a task
app.patch('/tasks/:id', authenticateToken, (req, res) => {
    const {
        title,
        description,
        status,
        priority,
        due_date,
        project_id
    } = req.body;

    if (Object.keys(req.body).length === 0) {
        return res.status(400).json({
            message: 'Provide at least one field to update'
        });
    }

    if (title !== undefined && !title.trim()) {
        return res.status(400).json({
            message: 'Task title cannot be empty'
        });
    }

    if (
        status !== undefined &&
        !['pending', 'in_progress', 'completed'].includes(status)
    ) {
        return res.status(400).json({
            message: 'Invalid task status'
        });
    }

    if (
        priority !== undefined &&
        !['low', 'medium', 'high'].includes(priority)
    ) {
        return res.status(400).json({
            message: 'Invalid task priority'
        });
    }

    const query = `
        UPDATE tasks AS t
        SET
            title = COALESCE($1, t.title),
            description = COALESCE($2, t.description),
            status = COALESCE($3, t.status),
            priority = COALESCE($4, t.priority),
            due_date = COALESCE($5, t.due_date),
            project_id = COALESCE($6, t.project_id),
            updated_at = CURRENT_TIMESTAMP
        WHERE t.id = $7
          AND t.user_id = $8
          AND (
              $6::INTEGER IS NULL OR EXISTS (
                  SELECT 1 FROM projects p
                  WHERE p.id = $6 AND p.user_id = $8
              )
          )
        RETURNING t.*
    `;

    pool.query(
        query,
        [
            title === undefined ? null : title.trim(),
            description ?? null,
            status ?? null,
            priority ?? null,
            due_date ?? null,
            project_id ?? null,
            req.params.id,
            req.user.id
        ],
        (error, result) => {
            if (error) {
                return res.status(500).json({
                    message: 'Failed to update task'
                });
            }

            if (result.rows.length === 0) {
                return res.status(404).json({
                    message: 'Task or project not found'
                });
            }

            res.json({
                message: 'Task updated successfully',
                task: result.rows[0]
            });
        }
    );
});


// Delete a task
app.delete('/tasks/:id', authenticateToken, (req, res) => {
    pool.query(
        `DELETE FROM tasks
         WHERE id = $1 AND user_id = $2
         RETURNING id`,
        [req.params.id, req.user.id],
        (error, result) => {
            if (error) {
                return res.status(500).json({
                    message: 'Failed to delete task'
                });
            }

            if (result.rows.length === 0) {
                return res.status(404).json({
                    message: 'Task not found'
                });
            }

            res.json({
                message: 'Task deleted successfully'
            });
        }
    );
});


// ==================== DASHBOARD ====================

app.get('/dashboard', authenticateToken, (req, res) => {
    const query = `
        SELECT
            COUNT(*)::INTEGER AS total_tasks,
            COUNT(*) FILTER (WHERE status = 'completed')::INTEGER
                AS completed_tasks,
            COUNT(*) FILTER (WHERE status = 'pending')::INTEGER
                AS pending_tasks,
            COUNT(*) FILTER (WHERE status = 'in_progress')::INTEGER
                AS in_progress_tasks,
            COUNT(*) FILTER (
                WHERE due_date < CURRENT_DATE
                  AND status != 'completed'
            )::INTEGER AS overdue_tasks
        FROM tasks
        WHERE user_id = $1
    `;

    pool.query(query, [req.user.id], (error, result) => {
        if (error) {
            return res.status(500).json({
                message: 'Failed to fetch dashboard statistics'
            });
        }

        res.json(result.rows[0]);
    });
});


// ==================== HOME ROUTE ====================

app.get('/', (req, res) => {
    res.json({
        message: 'Task Management API is running!'
    });
});


// ==================== START SERVER ====================

initializeDatabase()
    .then(() => {
        console.log('Database tables created successfully!');

        app.listen(port, () => {
            console.log(`Server is running on http://localhost:${port}`);
        });
    })
    .catch((error) => {
        console.error('Database initialization failed:', error.message);
        process.exit(1);
    });