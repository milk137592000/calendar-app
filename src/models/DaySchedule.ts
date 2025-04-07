import mongoose from 'mongoose';

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

export default mongoose.models.DaySchedule || mongoose.model('DaySchedule', dayScheduleSchema); 