import mongoose from 'mongoose';
import dotenv from 'dotenv';

// 載入環境變量
dotenv.config({ path: '.env.local' });

const dayScheduleSchema = new mongoose.Schema({
    date: { type: String, required: true },
    shifts: {
        A: { type: String, required: true },
        B: { type: String, required: true },
        C: { type: String, required: true },
        D: { type: String, required: true }
    },
    leaveRecords: [{ type: mongoose.Schema.Types.ObjectId, ref: 'LeaveRecord' }],
    holidays: [{ type: String }]
});

const DaySchedule = mongoose.models.DaySchedule || mongoose.model('DaySchedule', dayScheduleSchema);

async function checkSchedule() {
    try {
        if (!process.env.MONGODB_URI) {
            throw new Error('MONGODB_URI is not defined');
        }

        await mongoose.connect(process.env.MONGODB_URI);
        console.log('Connected to MongoDB');

        const schedule = await DaySchedule.findOne({ date: '2025-04-07' });
        console.log('Schedule for 2025-04-07:', schedule);

        await mongoose.disconnect();
    } catch (error) {
        console.error('Error:', error);
    }
}

checkSchedule(); 