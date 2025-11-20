const mongoose = require('mongoose');
const bcrypt = require('bcrypt');

const userSchema = new mongoose.Schema({
    username: {
        type: String,
        required: true,
        unique: true,
        trim: true,
        minlength: 3,
        maxlength: 30,
        match: /^[a-zA-Z0-9_-]+$/
    },
    email: {
        type: String,
        required: true,
        unique: true,
        lowercase: true,
        trim: true,
        match: /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    },
    password: {
        type: String,
        required: true,
        minlength: 6
    },

    avatar: {
        type: String,
        default: null
    },

    bio: {
        type: String,
        maxlength: 500
    },
    role: {
        type: String,
        enum: ['user', 'moderator', 'admin'],
        default: 'user'
    },
    isActive: {
        type: Boolean,
        default: true
    },
    isVerified: {
        type: Boolean,
        default: false
    },
    lastLogin: {
        type: Date,
        default: null
    },
    preferences: {
        notifications: {
            type: Boolean,
            default: true
        },
        privacy: {
            type: String,
            enum: ['public', 'friends', 'private'],
            default: 'public'
        },
        theme: {
            type: String,
            enum: ['light', 'dark', 'auto'],
            default: 'dark'
        }
    },
    stats: {
        totalStreams: {
            type: Number,
            default: 0
        },
        totalViews: {
            type: Number,
            default: 0
        },
        totalStreamTime: {
            type: Number,
            default: 0
        },
        followers: {
            type: Number,
            default: 0
        },
        following: {
            type: Number,
            default: 0
        }
    },
    createdAt: {
        type: Date,
        default: Date.now
    },
    updatedAt: {
        type: Date,
        default: Date.now
    }
})


userSchema.index({ username: 1 });
userSchema.index({ email: 1 });
userSchema.index({ createdAt: -1 });
userSchema.index({ 'stats.totalViews': -1 });
userSchema.index({ role: 1 });

userSchema.pre('save', async function (next) {
    this.updatedAt = new Date();
    
    if (!this.isModified('password')) return next();
    
    try {
        const salt = await bcrypt.genSalt(12);
        this.password = await bcrypt.hash(this.password, salt);
        next();
    } catch (error) {
        next(error);
    }
});

userSchema.methods.comparePassword = async function (candidatePassword) {
    return bcrypt.compare(candidatePassword, this.password)
}

userSchema.methods.getPublicProfile = function () {
    return {
        id: this._id,
        username: this.username,

        avatar: this.avatar,
        bio: this.bio,
        isVerified: this.isVerified,
        stats: this.stats,
        createdAt: this.createdAt,
        role: this.role
    };
};

userSchema.methods.getSafeProfile = function () {
    return {
        ...this.getPublicProfile(),
        email: this.email,
        preferences: this.preferences,
        lastLogin: this.lastLogin,
        updatedAt: this.updatedAt
    };
};

module.exports = mongoose.model('User', userSchema);