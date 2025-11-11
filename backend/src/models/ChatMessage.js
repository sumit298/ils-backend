const mongoose = require('mongoose');

const chatMessageSchema = new mongoose.Schema({
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
        index: true
    },
    streamId: {
        type: String,
        required: true,
        index: true
    },
    content: {
        type: String,
        required: true,
        trim: true,
        maxlength: 500
    }, originalContent: {
        type: String, // Store original before sanitization for moderation
        maxlength: 500
    },
    type: {
        type: String,
        enum: ['text', 'emoji', 'system', 'gif', 'sticker', 'command'],
        default: 'text',
        index: true
    },
    reactions: {
        type: Map,
        of: [{
            userId: {
                type: mongoose.Schema.Types.ObjectId,
                ref: 'User'
            },
            timestamp: {
                type: Date,
                default: Date.now
            }
        }],
        default: new Map()
    },
    edited: {
        type: Boolean,
        default: false
    },
    editedAt: {
        type: Date,
        default: null
    },
    editHistory: [{
        content: String,
        editedAt: {
            type: Date,
            default: Date.now
        }
    }],
    deleted: {
        type: Boolean,
        default: false,
        index: true
    },
    deletedAt: {
        type: Date,
        default: null
    },
    deletedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        default: null
    },
    deletedReason: {
        type: String,
        enum: ['spam', 'inappropriate', 'harassment', 'off-topic', 'other', null],
        default: null
    },
    moderation: {
        flagged: {
            type: Boolean,
            default: false
        },
        flaggedBy: [{
            userId: {
                type: mongoose.Schema.Types.ObjectId,
                ref: 'User'
            },
            reason: String,
            timestamp: {
                type: Date,
                default: Date.now
            }
        }],
        autoModerated: {
            type: Boolean,
            default: false
        },
        confidence: {
            type: Number,
            min: 0,
            max: 1,
            default: null
        },
        reasons: [String] // Reasons from auto-moderation
    },
    metadata: {
        userAgent: String,
        ipHash: String, // Hashed IP for privacy
        location: {
            country: String,
            region: String
        },
        device: {
            type: String,
            enum: ['desktop', 'mobile', 'tablet', 'tv'],
            default: 'desktop'
        },
        contentLength: {
            type: Number,
            default: 0
        },
        responseToMessageId: {
            type: String,
            default: null // For threaded conversations
        }
    },
    analytics: {
        viewCount: {
            type: Number,
            default: 0
        },
        reactionCount: {
            type: Number,
            default: 0
        },
        reportCount: {
            type: Number,
            default: 0
        }
    },
    timestamp: {
        type: Date,
        default: Date.now,
        index: true
    },
})

// Compound indexes for efficient queries
chatMessageSchema.index({ streamId: 1, timestamp: -1 });
chatMessageSchema.index({ streamId: 1, deleted: 1, timestamp: -1 });
chatMessageSchema.index({ userId: 1, timestamp: -1 });
chatMessageSchema.index({ deleted: 1, 'moderation.flagged': 1 });
chatMessageSchema.index({ type: 1, streamId: 1 });


// TTL index for automatic cleanup of old messages (optional)
chatMessageSchema.index({ timestamp: 1 }, { expireAfterSeconds: 2592000 }); // 30 days

chatMessageSchema.pre('save', function (next) {
    if (this.isModified('content')) {
        this.metadata.contentLength = this.content.length;
    }

    if (this.isModified('reactions')) {
        this.analytics.reactionCount = Array.from(this.reactions.values()).reduce((sum, reactions) => sum + reactions.length, 0);
    }
    next();
})

chatMessageSchema.virtual('totalReactions').get(function () {
    return Array.from(this.reactions.values()).reduce((sum, reactions) => sum + reactions.length, 0);
})

chatMessageSchema.methods.addReaction = function (emoji, userId) {
    if (!this.reactions.has(emoji)) {
        this.reactions.set(emoji, []);

    }

    const reactions = this.reactions.get(emoji);
    const existingReaction = reactions.find((r) => r.userId.toString() === userId.toString());

    if (!existingReaction) {
        reactions.push({ userId, timestamp: new Date() });
        this.reactions.set(emoji, reactions);
        return true;
    }
    return false;
}

chatMessageSchema.methods.removeReaction = function (emoji, userId) {
    if (!this.reactions.has(emoji)) return false;
    const reactions = this.reactions.get(emoji);
    const filteredReactions = reactions.filter(r => r.userId.toString() !== userId.toString())

    if (filteredReactions.length === 0) {
        this.reactions.delete(emoji);

    }
    else {
        this.reactions.set(emoji, filteredReactions);
    }
    return true;
}

chatMessageSchema.methods.flagMessage = function (userId, reason) {
    this.moderation.flagged = true;
    this.moderation.flaggedBy.push({
        userId,
        reason,
        timestamp: new Date()
    });
    this.analytics.reportCount += 1;
};

chatMessageSchema.methods.getSafeMessage = function () {
    return {
        id: this.id,
        userId: this.userId,
        content: this.deleted ? '[Message deleted]' : this.content,
        type: this.type,
        reactions: Object.fromEntries(this.reactions),
        edited: this.edited,
        editedAt: this.editedAt,
        deleted: this.deleted,
        timestamp: this.timestamp,
        totalReactions: this.totalReactions,
        responseToMessageId: this.metadata.responseToMessageId
    };
};

module.exports = mongoose.model('ChatMessage', chatMessageSchema);