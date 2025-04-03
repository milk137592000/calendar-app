export interface LeaveRecord {
    _id?: string;
    date: string;
    name: string;
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