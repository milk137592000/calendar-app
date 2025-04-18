import mongoose, { Schema, Document } from 'mongoose';

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
});

// 定義加班人員 Schema
const OvertimeMemberSchema = new mongoose.Schema({
    name: {
        type: String,
        required: true
    },
    team: {
        type: String,
        required: true
    },
    confirmed: {
        type: Boolean,
        required: true,
        default: false
    }
});

// Define an interface for the OvertimeMember document structure if not already present
export interface OvertimeMember extends Document {
    name: string;
    team: string;
    confirmed: boolean;
}

// Define an interface for the FullDayOvertime document structure
export interface FullDayOvertime extends Document {
    type: '加整班' | '加一半';
    fullDayMember?: OvertimeMember;
    firstHalfMember?: OvertimeMember;
    secondHalfMember?: OvertimeMember;
}

// 甲加班單（對應全天假）
const FullDayOvertimeSchema = new mongoose.Schema<FullDayOvertime>({
    type: {
        type: String,
        enum: ['加整班', '加一半'],
        required: true
    },
    // 加整班時只需要一個人員
    fullDayMember: {
        type: OvertimeMemberSchema,
        required: false
    },
    // 加一半時需要兩個時段的人員
    firstHalfMember: {
        type: OvertimeMemberSchema,
        required: false
    },
    secondHalfMember: {
        type: OvertimeMemberSchema,
        required: false
    }
});

// 乙加班單（對應自定義時段假）
const CustomOvertimeSchema = new mongoose.Schema({
    name: {
        type: String,
        required: true
    },
    team: {
        type: String,
        required: true
    },
    startTime: {
        type: String,
        required: true
    },
    endTime: {
        type: String,
        required: true
    },
    confirmed: {
        type: Boolean,
        required: true,
        default: false
    }
});

const LeaveRecordSchema = new mongoose.Schema({
    date: {
        type: String,
        required: true,
        index: true
    },
    name: {
        type: String,
        required: true
    },
    team: {
        type: String
    },
    period: {
        type: mongoose.Schema.Types.Mixed,
        required: true,
        validate: {
            validator: function (value: any) {
                if (value === 'fullDay') return true;
                if (typeof value !== 'object') return false;
                if (value.type !== 'custom') return false;
                if (typeof value.startTime !== 'string' || typeof value.endTime !== 'string') return false;

                // 驗證時間格式 HH:mm
                const timeRegex = /^([01][0-9]|2[0-3]):[0-5][0-9]$/;
                return timeRegex.test(value.startTime) && timeRegex.test(value.endTime);
            },
            message: 'Period must be either "fullDay" or a custom period object with valid startTime and endTime in HH:mm format'
        }
    },
    confirmed: {
        type: Boolean,
        required: true,
        default: false
    },
    // 甲加班單（對應全天假）
    fullDayOvertime: {
        type: FullDayOvertimeSchema,
        required: false,
        default: undefined
    },
    // 乙加班單（對應自定義時段假）
    customOvertime: {
        type: CustomOvertimeSchema,
        required: false,
        default: undefined
    }
}, {
    timestamps: true
});

// 添加複合索引以確保同一天同一人只能請一次假
LeaveRecordSchema.index({ date: 1, name: 1 }, { unique: true });

// 移除未使用的 Overtime 模型導出
export const LeaveRecord = mongoose.models.LeaveRecord || mongoose.model('LeaveRecord', LeaveRecordSchema);
export const CustomOvertime = mongoose.models.CustomOvertime || mongoose.model('CustomOvertime', CustomOvertimeSchema);
export const OvertimeMemberModel = mongoose.models.OvertimeMember || mongoose.model('OvertimeMember', OvertimeMemberSchema);
export const FullDayOvertimeModel = mongoose.models.FullDayOvertime || mongoose.model('FullDayOvertime', FullDayOvertimeSchema); 