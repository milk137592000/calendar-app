export interface LeaveRecord {
    _id?: string;
    date: string;
    name: string;
    team?: string;
    confirmed?: boolean;
    overtime?: {
        type?: 'bigRest' | 'regular';
        name: string;
        team?: string;
        confirmed?: boolean;
        firstConfirmed?: boolean;
        firstMember?: string;
        secondMember?: {
            name: string;
            team?: string;
            confirmed?: boolean;
        };
    } | undefined;
    createdAt?: Date;
    updatedAt?: Date;
} 