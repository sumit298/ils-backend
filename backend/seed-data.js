const mongoose = require('mongoose');
const bcrypt = require('bcrypt');

// Import models
const { User, Stream, ChatMessage } = require('./src/models');

const seedData = async () => {
    try {
        console.log('🌱 Starting database seeding...');
        
        // Connect to database
        await mongoose.connect(process.env.DATABASE_URL || 'mongodb://localhost:27018/streamHub');
        console.log('✅ Connected to database');

        // Clear existing data
        await User.deleteMany({});
        await Stream.deleteMany({});
        await ChatMessage.deleteMany({});
        console.log('🗑️ Cleared existing data');

        // Create test users
        const users = [
            {
                username: 'johndoe',
                email: 'john@example.com',
                password: await bcrypt.hash('password123', 10),
                displayName: 'John Doe',
                bio: 'Professional game streamer and content creator',
                isActive: true
            },
            {
                username: 'sarahgamer',
                email: 'sarah@example.com',
                password: await bcrypt.hash('password123', 10),
                displayName: 'Sarah Gaming',
                bio: 'Variety streamer | Music & Gaming | Live daily at 8PM EST',
                isActive: true
            },
            {
                username: 'techcoder',
                email: 'tech@example.com',
                password: await bcrypt.hash('password123', 10),
                displayName: 'Tech Coder',
                bio: 'Live coding sessions | JavaScript | React | Node.js',
                isActive: true
            },
            {
                username: 'artcreator',
                email: 'art@example.com',
                password: await bcrypt.hash('password123', 10),
                displayName: 'Digital Artist',
                bio: 'Digital art tutorials and live drawing sessions',
                isActive: true
            },
            {
                username: 'musiclive',
                email: 'music@example.com',
                password: await bcrypt.hash('password123', 10),
                displayName: 'Music Live',
                bio: 'Live music performances | Guitar | Piano | Vocals',
                isActive: true
            }
        ];

        const createdUsers = await User.insertMany(users);
        console.log('👥 Created 5 test users');

        // Create test streams
        const { v4: uuidv4 } = require('uuid');
        const streams = [
            {
                id: uuidv4(),
                title: 'Live Coding: Building a React App',
                description: 'Join me as I build a full-stack React application from scratch. We\'ll cover components, hooks, and API integration.',
                category: 'technology',
                isLive: true,
                userId: createdUsers[2]._id, // techcoder
                thumbnail: 'https://picsum.photos/400/225?random=1',
                tags: ['react', 'javascript', 'coding', 'tutorial'],
                stats: {
                    viewers: 142,
                    maxViewers: 180,
                    totalViews: 1250,
                    chatMessages: 89,
                    likes: 45
                },
                startedAt: new Date(Date.now() - 3600000) // Started 1 hour ago
            },
            {
                id: uuidv4(),
                title: 'Valorant Ranked Climb - Road to Radiant',
                description: 'Grinding ranked matches in Valorant. Come chat and watch some high-level gameplay!',
                category: 'gaming',
                isLive: true,
                userId: createdUsers[1]._id, // sarahgamer
                thumbnail: 'https://picsum.photos/400/225?random=2',
                tags: ['valorant', 'fps', 'ranked', 'gaming'],
                stats: {
                    viewers: 89,
                    maxViewers: 120,
                    totalViews: 890,
                    chatMessages: 156,
                    likes: 67
                },
                startedAt: new Date(Date.now() - 1800000) // Started 30 minutes ago
            },
            {
                id: uuidv4(),
                title: 'Digital Art: Character Design Process',
                description: 'Creating a fantasy character from concept to final render. Using Photoshop and drawing tablet.',
                category: 'art',
                isLive: true,
                userId: createdUsers[3]._id, // artcreator
                thumbnail: 'https://picsum.photos/400/225?random=3',
                tags: ['art', 'digital', 'character', 'design'],
                stats: {
                    viewers: 67,
                    maxViewers: 85,
                    totalViews: 450,
                    chatMessages: 78,
                    likes: 34
                },
                startedAt: new Date(Date.now() - 2700000) // Started 45 minutes ago
            },
            {
                id: uuidv4(),
                title: 'Acoustic Guitar Session - Taking Requests',
                description: 'Chill acoustic guitar session. Drop song requests in chat and I\'ll try to play them!',
                category: 'music',
                isLive: false,
                userId: createdUsers[4]._id, // musiclive
                thumbnail: 'https://picsum.photos/400/225?random=4',
                tags: ['music', 'guitar', 'acoustic', 'requests'],
                stats: {
                    viewers: 0,
                    maxViewers: 95,
                    totalViews: 680,
                    chatMessages: 123,
                    likes: 52
                },
                startedAt: new Date(Date.now() - 86400000), // Started yesterday
                endedAt: new Date(Date.now() - 82800000) // Ended 1 hour later
            },
            {
                id: uuidv4(),
                title: 'Minecraft Building: Medieval Castle',
                description: 'Building an epic medieval castle in Minecraft survival mode. Day 3 of the project!',
                category: 'gaming',
                isLive: false,
                userId: createdUsers[0]._id, // johndoe
                thumbnail: 'https://picsum.photos/400/225?random=5',
                tags: ['minecraft', 'building', 'survival', 'castle'],
                stats: {
                    viewers: 0,
                    maxViewers: 156,
                    totalViews: 1100,
                    chatMessages: 234,
                    likes: 89
                },
                startedAt: new Date(Date.now() - 172800000), // Started 2 days ago
                endedAt: new Date(Date.now() - 165600000) // Ended 2 hours later
            }
        ];

        const createdStreams = await Stream.insertMany(streams);
        console.log('📺 Created 5 test streams (3 live, 2 offline)');

        // Create test chat messages for live streams
        const messages = [];
        const liveStreams = createdStreams.filter(stream => stream.isLive);

        for (const stream of liveStreams) {
            // Add messages from different users
            messages.push(
                {
                    id: uuidv4(),
                    content: 'Hey everyone! Great stream as always! 👋',
                    type: 'text',
                    userId: createdUsers[0]._id,
                    streamId: stream.id,
                    timestamp: new Date(Date.now() - 300000) // 5 minutes ago
                },
                {
                    id: uuidv4(),
                    content: 'This is so helpful, thank you for explaining!',
                    type: 'text',
                    userId: createdUsers[1]._id,
                    streamId: stream.id,
                    timestamp: new Date(Date.now() - 240000) // 4 minutes ago
                },
                {
                    id: uuidv4(),
                    content: '🔥🔥🔥',
                    type: 'emoji',
                    userId: createdUsers[2]._id,
                    streamId: stream.id,
                    timestamp: new Date(Date.now() - 180000) // 3 minutes ago
                },
                {
                    id: uuidv4(),
                    content: 'Can you show that part again?',
                    type: 'text',
                    userId: createdUsers[3]._id,
                    streamId: stream.id,
                    timestamp: new Date(Date.now() - 120000) // 2 minutes ago
                },
                {
                    id: uuidv4(),
                    content: 'New viewer here, loving the content! 💯',
                    type: 'text',
                    userId: createdUsers[4]._id,
                    streamId: stream.id,
                    timestamp: new Date(Date.now() - 60000) // 1 minute ago
                }
            );
        }

        await ChatMessage.insertMany(messages);
        console.log('💬 Created test chat messages for live streams');

        // Update user stats (if User model has these fields)
        // await User.findByIdAndUpdate(createdUsers[2]._id, {
        //     $inc: { totalStreams: 1, totalViewers: 142 }
        // });

        console.log('📊 Updated user statistics');

        console.log('\n🎉 Database seeding completed successfully!');
        console.log('\n📋 Test Data Summary:');
        console.log('👥 Users: 5 (all with password: "password123")');
        console.log('📺 Streams: 5 (3 live, 2 offline)');
        console.log('💬 Messages: 15 (5 per live stream)');
        console.log('\n🔑 Test Login Credentials:');
        console.log('Email: john@example.com | Password: password123');
        console.log('Email: sarah@example.com | Password: password123');
        console.log('Email: tech@example.com | Password: password123');
        console.log('Email: art@example.com | Password: password123');
        console.log('Email: music@example.com | Password: password123');

    } catch (error) {
        console.error('❌ Seeding failed:', error);
    } finally {
        await mongoose.disconnect();
        console.log('🔌 Disconnected from database');
        process.exit(0);
    }
};

// Run the seeding
seedData();