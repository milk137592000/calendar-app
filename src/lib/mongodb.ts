import mongoose from 'mongoose';

interface GlobalMongoose {
    conn: typeof mongoose | null;
    promise: Promise<typeof mongoose> | null;
}

declare global {
    var mongoose: GlobalMongoose | undefined;
}

if (!process.env.MONGODB_URI) {
    throw new Error('Please define the MONGODB_URI environment variable inside .env.local');
}

const MONGODB_URI = process.env.MONGODB_URI;

let cached = global.mongoose || { conn: null, promise: null };
global.mongoose = cached;

async function connectDB() {
    if (cached.conn) {
        console.log('Using cached MongoDB connection');
        return cached.conn;
    }

    if (!cached.promise) {
        const opts = {
            bufferCommands: false,
            serverSelectionTimeoutMS: 10000,
            socketTimeoutMS: 45000,
            family: 4,
        };

        console.log('Connecting to MongoDB...');
        cached.promise = mongoose.connect(MONGODB_URI, opts)
            .then((mongoose) => {
                console.log('MongoDB connected successfully');
                return mongoose;
            })
            .catch((error) => {
                console.error('MongoDB connection error:', error);
                cached.promise = null;
                throw error;
            });
    }

    try {
        cached.conn = await cached.promise;
    } catch (error) {
        cached.promise = null;
        console.error('Failed to establish MongoDB connection:', error);
        throw error;
    }

    return cached.conn;
}

export default connectDB; 