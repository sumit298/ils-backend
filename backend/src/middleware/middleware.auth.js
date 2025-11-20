const jwt = require('jsonwebtoken');
const { User } = require('../models');

class AuthMiddleWare {
    static async authenticate(req, res, next) {
        try {
            const authHeader = req.headers.authorization;
            const cookieToken = req.cookies.token;

            // Try cookie first (more secure), then header (fallback)
            const token = cookieToken || (authHeader && authHeader.replace('Bearer ', ''));

            if (!token) {
                return res.status(401).json({ message: 'Access denied, Invalid token format.' });
            }

            try {
                const decoded = jwt.verify(token, process.env.JWT_SECRET || 'fallback-secret');

                const user = await User.findById(decoded.userId);

                if (!user || !user.isActive) {
                    return res.status(401).json({ message: 'User not found or inactive.' });
                }

                if (decoded.exp * 1000 < Date.now()) {
                    return res.status(401).json({ message: 'Token expired.' });
                }

                req.userId = decoded.userId;

                req.user = {
                    id: decoded.userId,
                    username: decoded.username,
                    email: user.email,
                    role: user.role || 'user' //todo: see if it feasible then not return this
                }

                next();
            } catch (jwtError) {
                if (jwtError.name === 'TokenExpiredError') {
                    return res.status(401).json({ error: 'Token expired.' });
                } else if (jwtError.name === 'JsonWebTokenError') {
                    return res.status(401).json({ error: 'Invalid token.' });
                } else {
                    throw jwtError;
                }
            }
        } catch (error) {
            console.error('Authentication error:', error);
            return res.status(500).json({ error: 'Authentication service error.' });
        }
    }

    static socketAuth(socket, next) {
        try {
            const token = socket.handshake.auth.token;

            if (!token) {
                return next(new Error('Authentication error: No token provided.'));
            }

            jwt.verify(token, process.env.JWT_SECRET || 'fallback-secret', async (err, decoded) => {
                if (err) {
                    return next(new Error('Authentication error: Invalid token.'));
                }

                try {
                    const user = await User.findById(decoded.userId);
                    if (!user || !user.isActive) {
                        return next(new Error('Authentication error: User not found or inactive.'));
                    }

                    socket.userId = decoded.userId;
                    socket.user = {
                        id: decoded.userId,
                        username: decoded.username,
                        email: user.email,
                        role: user.role || 'user'
                    }

                    next();
                } catch (dbError) {
                    console.error('Socket auth database error:', dbError);
                    next(new Error('Authentication error: Database error'));
                }
            })
        } catch (error) {
            console.error('Socket authentication error:', error);
            next(new Error('Authentication error'));
        }
    }

    static requiredRoles(roles) {
        return (req, res, next) => {
            if (!req.user) {
                return res.status(401).json({ error: 'Authentication required' });
            }

            const userRole = req.user.role || 'user';
            const allowedRoles = Array.isArray(roles) ? roles : [roles];

            if (allowedRoles.includes(userRole)) {
                next();
            } else {
                res.status(403).json({ error: 'Access denied' });
            }
        }
    }

    static requireStreamOwnership(req, res, next) {
        // This middleware should be used after authenticate
        // It will be implemented in the route handler since it needs stream data
        next();
    }

    static createToken(user) {
        return jwt.sign({ userId: user.id, username: user.username }, process.env.JWT_SECRET || 'fallback-secret', {
            expiresIn: '2h',
            issuer: 'ils-platform',
            audience: 'ils-users',
            algorithm: 'HS256'
        })
    }

    static refreshToken(token) {
        try {
            const decoded = jwt.verify(token, process.env.JWT_SECRET || 'fallback-secret', {
                ignoreExpiration: true
            })

            // checking token if it is not too old
            const tokenAge = Date.now() / 1000 - decoded.iat;
            if (tokenAge > 7 * 24 * 60 * 60) {
                throw new Error('token too old to refresh')
            }

            return AuthMiddleWare.createToken({
                id: decoded.userId,
                username: decoded.username
            })
        } catch (error) {
            throw new Error('Cannot refresh token: ' + error.message);

        }
    }
}

module.exports = AuthMiddleWare;