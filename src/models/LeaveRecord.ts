import mongoose from 'mongoose';

const LeaveRecordSchema = new mongoose.Schema({
    date: {
        type: String,
        required: true,
    },
    name: {
        type: String,
        required: true,
    },
    overtime: {
        type: {
            type: String,
            enum: ['bigRest', 'regular'],
            required: true,
        },
        name: String,
        team: String,
        confirmed: {
            type: Boolean,
            default: false,
        },
        firstConfirmed: {
            type: Boolean,
            default: false,
        },
        secondMember: {
            name: String,
            team: String,
            confirmed: {
                type: Boolean,
                default: false,
            },
        },
    },
}, {
    timestamps: true,
});

export default mongoose.models.LeaveRecord || mongoose.model('LeaveRecord', LeaveRecordSchema); 