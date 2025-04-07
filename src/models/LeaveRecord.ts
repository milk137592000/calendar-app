import mongoose from 'mongoose';

const CustomPeriodSchema = new mongoose.Schema({
    type: {
        type: String,
        enum: ['custom'],
        required: true
    },
    startTime: {
        type: String,
        required: true
    },
    endTime: {
        type: String,
        required: true
    }
}, { _id: false });

// 定義加班人員 Schema
const OvertimeMemberSchema = new mongoose.Schema({
    name: {
        type: String,
        default: ''
    },
    team: {
        type: String,
        default: ''
    },
    confirmed: {
        type: Boolean,
        default: false
    }
}, { _id: false });

// 定義加班 Schema
const OvertimeSchema = new mongoose.Schema({
    type: {
        type: String,
        enum: ['全天', '半天'],
        required: true
    },
    name: {
        type: String,
        default: '',
        required: function (this: any) {
            return this.type === '全天' && this.confirmed;
        }
    },
    team: {
        type: String,
        default: '',
        required: function (this: any) {
            return this.type === '全天' && this.confirmed;
        }
    },
    confirmed: {
        type: Boolean,
        default: false
    },
    firstConfirmed: {
        type: Boolean,
        default: false
    },
    secondMember: {
        name: {
            type: String,
            default: ''
        },
        team: {
            type: String,
            default: ''
        },
        confirmed: {
            type: Boolean,
            default: false
        }
    }
}, { _id: false });

// 定義自定義時段加班 Schema
const CustomOvertimeSchema = new mongoose.Schema({
    name: String,
    team: String,
    startTime: String,
    endTime: String,
    confirmed: {
        type: Boolean,
        default: false
    }
}, { _id: false });

const LeaveRecordSchema = new mongoose.Schema({
    date: {
        type: String,
        required: true,
    },
    name: {
        type: String,
        required: true,
    },
    team: {
        type: String,
        default: ''
    },
    period: {
        type: mongoose.Schema.Types.Mixed,
        validate: {
            validator: function (value: any) {
                // 允許 'fullDay' 字串
                if (value === 'fullDay') return true;

                // 允許自定義時段物件
                if (typeof value === 'object' && value !== null) {
                    return (
                        value.type === 'custom' &&
                        typeof value.startTime === 'string' &&
                        typeof value.endTime === 'string'
                    );
                }

                return false;
            },
            message: 'Invalid period format'
        },
        default: 'fullDay'
    },
    // 全天請假的加班資訊，使用 overtime 字段而不是 fullDayOvertime
    overtime: {
        type: OvertimeSchema,
        required: false
    },
    // 自定義時段的加班資訊
    customOvertime: {
        type: CustomOvertimeSchema,
        required: false
    },
    confirmed: {
        type: Boolean,
        default: false
    }
}, {
    timestamps: true,
});

export default mongoose.models.LeaveRecord || mongoose.model('LeaveRecord', LeaveRecordSchema); 