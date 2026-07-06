import mongoose, { Document, Schema } from 'mongoose';

interface IAIPodcastTurn {
  speaker: 'A' | 'B';
  text: string;
  audioUrl?: string;
}

export interface IAIPodcast extends Document {
  userId: mongoose.Types.ObjectId;
  topic: string;
  voice: 'male' | 'female' | 'british';
  duration: '5min' | '10min' | '15min';
  knowledgeBase?: string;
  avatarImage?: string;
  
  script: IAIPodcastTurn[];
  status: 'generating' | 'ready' | 'failed';
  error?: string;
  
  podcastId: string;
  
  createdAt: Date;
  updatedAt: Date;
}

const AIPodcastSchema = new Schema<IAIPodcast>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    topic: {
      type: String,
      required: true,
      trim: true,
    },
    voice: {
      type: String,
      enum: ['male', 'female', 'british'],
      default: 'male',
    },
    duration: {
      type: String,
      enum: ['5min', '10min', '15min'],
      default: '5min',
    },
    knowledgeBase: {
      type: String,
      trim: true,
    },
    avatarImage: {
      type: String,
    },
    script: [
      {
        speaker: {
          type: String,
          enum: ['A', 'B'],
          required: true,
        },
        text: {
          type: String,
          required: true,
        },
        audioUrl: {
          type: String,
        },
      },
    ],
    status: {
      type: String,
      enum: ['generating', 'ready', 'failed'],
      default: 'generating',
    },
    error: {
      type: String,
    },
    podcastId: {
      type: String,
      required: true,
      unique: true,
    },
  },
  {
    timestamps: true,
  }
);

// Indexes
AIPodcastSchema.index({ userId: 1, createdAt: -1 });
AIPodcastSchema.index({ podcastId: 1 });
AIPodcastSchema.index({ status: 1 });

export default mongoose.model<IAIPodcast>('AIPodcast', AIPodcastSchema);
