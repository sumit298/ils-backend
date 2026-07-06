import mongoose, { Document, Schema } from 'mongoose';

export interface IAIStreamer extends Document {
  ownerId: mongoose.Types.ObjectId;
  streamId: string;
  topic: string;
  persona: string;
  voice: 'male' | 'female' | 'british';
  status: 'idle' | 'live' | 'ended' | 'error';
  startedAt?: Date;
  endedAt?: Date;
  lastChatAt?: Date;
  lastSpokenAt?: Date;
  config: {
    idlePromptIntervalMs: number;
    maxDurationMs: number;
  };
  createdAt: Date;
  updatedAt: Date;
}

const AIStreamerSchema = new Schema<IAIStreamer>(
  {
    ownerId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    streamId: { type: String, required: true, unique: true },
    topic: { type: String, required: true, trim: true },
    persona: { type: String, required: true, trim: true },
    voice: { type: String, enum: ['male', 'female', 'british'], default: 'male' },
    status: { type: String, enum: ['idle', 'live', 'ended', 'error'], default: 'idle' },
    startedAt: { type: Date },
    endedAt: { type: Date },
    lastChatAt: { type: Date },
    lastSpokenAt: { type: Date },
    config: {
      idlePromptIntervalMs: { type: Number, default: 30000 },
      maxDurationMs: { type: Number, default: 3600000 },
    },
  },
  { timestamps: true }
);

AIStreamerSchema.index({ ownerId: 1, createdAt: -1 });
AIStreamerSchema.index({ status: 1 });
AIStreamerSchema.index({ streamId: 1 });

export default mongoose.model<IAIStreamer>('AIStreamer', AIStreamerSchema);
