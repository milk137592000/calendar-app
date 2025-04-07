export interface CustomPeriod {
    type: 'custom';
    startTime: string;
    endTime: string;
}

export interface FullDayOvertime {
    type: '全天' | '半天';
    name: string;
    team: string;
    confirmed: boolean;
    firstConfirmed: boolean;
    secondMember: {
        name: string;
        team: string;
        confirmed: boolean;
    } | null;
}

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
    overtime?: {
        type: '全天' | '半天';
        name: string;
        team: string;
        confirmed: boolean;
        firstConfirmed: boolean;
        secondMember: {
            name: string;
            team: string;
            confirmed: boolean;
        } | null;
    };
    customOvertime?: CustomOvertime;
    confirmed?: boolean;
    createdAt?: Date;
    updatedAt?: Date;
} 