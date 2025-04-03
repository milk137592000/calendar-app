import { TEAMS } from '@/data/teams';

export type ShiftType = '早班' | '中班' | '晚班' | '夜班' | '小休' | '大休';

const SHIFT_CYCLE: ShiftType[] = [
    '早班', '早班',   // 早班連續2天
    '中班', '中班',   // 中班連續2天
    '小休',          // 小休1天
    '夜班', '夜班',   // 夜班連續2天
    '大休'           // 大休1天
];

const TEAM_START_POSITIONS: Record<string, number> = {
    'A': 8,  // 大休是第8天
    'B': 2,  // 早班(第2天)是第2天
    'C': 4,  // 中班(第2天)是第4天
    'D': 6   // 夜班(第1天)是第6天
};

export function getShiftForDate(team: string, date: string): ShiftType {
    const startDate = new Date(2025, 3, 1); // 2025/04/01
    const targetDate = new Date(date);
    const daysDiff = Math.floor((targetDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24));
    
    const startPos = TEAM_START_POSITIONS[team];
    if (startPos === undefined) {
        return '早班'; // Default value for unknown teams
    }
    
    const cyclePosition = ((startPos - 1 + daysDiff) % 8 + 8) % 8;
    return SHIFT_CYCLE[cyclePosition];
}

export function getMemberTeam(memberName: string): string | null {
    for (const [team, data] of Object.entries(TEAMS)) {
        if (data.members.some(m => m.name === memberName)) {
            return team;
        }
    }
    return null;
}

export function isTeamBigRestOnTuesday(team: string): boolean {
    const startDate = new Date(2025, 3, 1); // 2025/04/01
    const today = new Date();
    const daysDiff = Math.floor((today.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24));
    
    const startPos = TEAM_START_POSITIONS[team];
    if (startPos === undefined) {
        return false;
    }
    
    const cyclePosition = ((startPos - 1 + daysDiff) % 8 + 8) % 8;
    const shift = SHIFT_CYCLE[cyclePosition];
    
    return today.getDay() === 2 && shift === '大休';
} 