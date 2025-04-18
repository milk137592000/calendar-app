export interface CustomPeriod {
    type: 'custom';
    startTime: string;
    endTime: string;
}

export interface OvertimeMember {
    name: string;
    team: string;
    confirmed: boolean;
}

// 舊版加班資料結構（向後兼容）
export interface Overtime {
    type: '全天' | '半天';
    name: string;
    team: string;
    confirmed: boolean;
    firstConfirmed: boolean;
    secondMember?: {
        name: string;
        team: string;
        confirmed: boolean;
    };
}

// 甲加班單（對應全天假）
export interface FullDayOvertime {
    type: '加整班' | '加一半';
    fullDayMember?: OvertimeMember;
    firstHalfMember?: OvertimeMember;
    secondHalfMember?: OvertimeMember;
}

// 乙加班單（對應自定義時段假）
export interface CustomOvertime {
    name: string;
    team: string;
    startTime: string;
    endTime: string;
    confirmed: boolean;
}

export interface LeaveRecord {
    _id: string;
    date: string;
    name: string;
    team?: string;
    period: CustomPeriod | 'fullDay';
    confirmed: boolean;
    overtime?: Overtime;  // 舊版加班資料（向後兼容）
    fullDayOvertime?: FullDayOvertime;
    customOvertime?: CustomOvertime;
    createdAt?: string;
    updatedAt?: string;
} 