const express = require("express");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const pool = require("./database");
const { JWT_SECRET } = require("./authMiddleware");

const router = express.Router();

// Register router
router.post("/register", async (req, res) => {
    try {
        const { username, email, password, role } = req.body;

        const validRoles = ["user", "admin"];
        if (role && !validRoles.includes(role)) {
            return res.status(400).json({ error: "Invalid role" });
        }

        const userCheck = await pool.query(
            "SELECT * FROM users WHERE email = $1",
            [email]
        );

        if (userCheck.rows.length > 0) {
            return res.status(400).json({ error: "User already exists" });
        }

        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password, salt);

        // Include role in the INSERT query
        const result = await pool.query(
            "INSERT INTO users (username, email, password, role) VALUES ($1, $2, $3, $4) RETURNING id, username, email, role",
            [username, email, hashedPassword, role || "user"]
        );

        const user = result.rows[0];

        const token = jwt.sign(
            {
                id: user.id,
                email: user.email,
                username: user.username,
                role: user.role,
            },
            JWT_SECRET,
            { expiresIn: "24h" }
        );

        res.json({
            token,
            user: {
                id: user.id,
                username: user.username,
                email: user.email,
                role: user.role,
            },
        });
    } catch (error) {
        console.error("Registration error:", error);
        res.status(500).json({ error: "Registration failed" });
    }
});

router.post("/login", async (req, res) => {
    try {
        const { email, password } = req.body;

        const result = await pool.query(
            "SELECT * FROM users WHERE email = $1",
            [email]
        );

        const user = result.rows[0];

        if (!user) {
            return res.status(401).json({ error: "Invalid credentials" });
        }

        const isValidPassword = await bcrypt.compare(password, user.password);

        if (!isValidPassword) {
            return res.status(401).json({ error: "Invalid credentials" });
        }

        const token = jwt.sign(
            {
                id: user.id,
                email: user.email,
                username: user.username,
                role: user.role,
            },
            JWT_SECRET,
            { expiresIn: "24h" }
        );

        res.json({
            token,
            user: {
                id: user.id,
                username: user.username,
                email: user.email,
                role: user.role,
            },
        });
    } catch (error) {
        console.error("Login error:", error);
        res.status(500).json({ error: "Login failed" });
    }
});

module.exports = router;
