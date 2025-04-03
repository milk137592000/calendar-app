export interface LeaveRecord {
    _id?: string;
    date: string;
    name: string;
    confirmed?: boolean;
    overtime?: {
        type: 'bigRest' | 'regular';
        name?: string;
        team?: string;
        confirmed?: boolean;
        firstConfirmed?: boolean;
        secondMember?: {
            name?: string;
            team?: string;
            confirmed?: boolean;
        };
    };
    createdAt?: Date;
    updatedAt?: Date;
} 