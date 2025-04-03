import { TEAMS } from '@/data/teams';

export type ShiftType = '早班' | '中班' | '晚班' | '大休';

export function getShiftForDate(team: string, date: string): ShiftType {
    // 實現班別計算邏輯
    return '早班'; // 臨時返回值
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
    // 實現週二大休判斷邏輯
    return false; // 臨時返回值
} 