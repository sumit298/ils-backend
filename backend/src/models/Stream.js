const mongoose = require('mongoose');

const streamSchema = new mongoose.Schema({
    id: {
        type: String,
        required: true,
        unique: true,
        index: true
    },
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
        index: true,
    },
    title: {
        type: String,
        required: true,
        trim: true,
        maxlength: 100,
    },
    description: {
        type: String,
        trim: true,
        maxlength: 1000
    },
    category: {
        type: String,
        required: true,
        enum: ['gaming', 'music', 'art', 'technology', 'education', 'entertainment', 'sports', 'general'],
        default: 'general',
        index: true
    },
    tags: [{
        type: String,
        trim: true,
        maxlength: 30
    }],
    isLive: {
        type: Boolean,
        default: false,
        index: true
    },
    isPrivate: {
        type: Boolean,
        default: false
    },
    thumbnail: {
        type: String,
        default: null
    },
    chatEnabled: {
        type: Boolean,
        default: true
    },
    recordingEnabled: {
        type: Boolean,
        default: false
    },
    recordingUrl: {
        type: String,
        default: null
    },
    startedAt: {
        type: Date,
        default: null
    },
    endedAt: {
        type: Date,
        default: null
    },
    duration: {
        type: Number, // in milliseconds
        default: 0
    },
    stats: {
        viewers: {
            type: Number,
            default: 0
        },
        maxViewers: {
            type: Number,
            default: 0,
            index: true // For sorting by popularity
        },
        totalViews: {
            type: Number,
            default: 0
        },
        chatMessages: {
            type: Number,
            default: 0
        },
        likes: {
            type: Number,
            default: 0
        },
        shares: {
            type: Number,
            default: 0
        }
    },
    settings: {
        quality: {
            type: String,
            enum: ['low', 'medium', 'high', 'ultra'],
            default: 'high'
        },
        maxBitrate: {
            type: Number,
            default: 2000,
            min: 100,
            max: 10000
        },
        framerate: {
            type: Number,
            default: 30,
            enum: [15, 30, 60]
        }
    },
    allowedViewers: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    }], // For private streams
    blockedUsers: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    }]
});

streamSchema.index({ userId: 1, createdAt: -1 });
streamSchema.index({ category: 1, isLive: 1, 'stats.viewers': -1 });
streamSchema.index({ isLive: 1, 'stats.maxViewers': -1 });
streamSchema.index({ createdAt: -1, isLive: 1 });

// Text index for search
streamSchema.index({
    title: 'text',
    description: 'text',
    tags: 'text'
}, {
    weights: {
        title: 10,
        tags: 5,
        description: 1
    }
});

streamSchema.pre('save', function (next) {
    if (this.isModified('endedAt') && this.endedAt && this.startedAt) {
        this.duration = this.endedAt.getTime() - this.startedAt.getTime();
    }
    next();
})

streamSchema.virtual('formattedDuration').get(function () {
    if (!this.duration) return "00:00:00";
    const hours = Math.floor(this.duration / 3600000);
    const minutes = Math.floor((this.duration % 3600000) / 60000);
    const seconds = Math.floor((this.duration % 60000) / 1000);

    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
})

streamSchema.methods.canUserView = function (userId) {
    if (!this.isPrivate) return true;
    if (this.userId.toString() === userId.toString()) return true;
    if (this.allowedViewers.includes(userId)) return true;
    return false;
}

streamSchema.methods.isUserBlocked = function (userId) {
    return this.blockedUsers.includes(userId);
}

streamSchema.methods.getPublicInfo = function () {
    return {
        id: this.id,
        title: this.title,
        description: this.description,
        category: this.category,
        tags: this.tags,
        isLive: this.isLive,
        thumbnail: this.thumbnail,
        stats: this.stats,
        settings: {
            quality: this.settings.quality
        },
        createdAt: this.createdAt,
        startedAt: this.startedAt,
        duration: this.duration,
        formattedDuration: this.formattedDuration
    };
};

module.exports = mongoose.model('Stream', streamSchema);
