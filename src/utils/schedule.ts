import { TEAMS } from '@/data/teams';
import { startOfWeek, endOfWeek, addDays, format } from 'date-fns';
import { ShiftType } from '@/types/schedule';

// 8天循環的班別順序
const SHIFT_CYCLE: ShiftType[] = [
    '早班', '早班',   // 早班連續2天
    '中班', '中班',   // 中班連續2天
    '小休',          // 小休1天
    '夜班', '夜班',   // 夜班連續2天
    '大休'           // 大休1天
];

// 計算2025/04/01每個班別在循環中的位置
const TEAM_START_POSITIONS: Record<string, number> = {
    'A': 7,  // 大休是第8天
    'B': 1,  // 早班(第2天)是第2天
    'C': 3,  // 中班(第2天)是第4天
    'D': 5   // 夜班(第1天)是第6天
};

// 獲取指定日期的班別
export const getShiftForDate = (date: Date | string, team: string): ShiftType | null => {
    // 如果 date 是字符串，將其轉換為 Date 對象
    const dateObj = typeof date === 'string' ? new Date(date) : date;
    const startDate = new Date('2025/04/01');
    const daysDiff = Math.floor((dateObj.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24));

    // 修正計算邏輯
    const cyclePosition = (TEAM_START_POSITIONS[team] + daysDiff) % 8;
    const adjustedPosition = cyclePosition < 0 ? cyclePosition + 8 : cyclePosition;

    if (adjustedPosition < 0 || adjustedPosition >= 8) {
        console.error(`Invalid cycle position calculated: ${adjustedPosition} for team ${team} on date ${date}`);
        return null;
    }

    const shift = SHIFT_CYCLE[adjustedPosition];
    console.log(`Team ${team} on ${date}: position=${adjustedPosition}, shift=${shift}`);
    return shift;
};

// 獲取成員所屬班級
export const getMemberTeam = (memberName: string): string | null => {
    for (const [team, teamData] of Object.entries(TEAMS)) {
        if (teamData.members.some(member => member.name === memberName)) {
            return team;
        }
    }
    return null;
};

// 獲取成員角色
export const getMemberRole = (memberName: string): string | null => {
    for (const teamData of Object.values(TEAMS)) {
        const member = teamData.members.find(member => member.name === memberName);
        if (member) {
            return member.role;
        }
    }
    return null;
};

// 獲取當日大休的班級
export const getBigRestTeam = (): string | null => {
    for (const [team, startPos] of Object.entries(TEAM_START_POSITIONS)) {
        if (startPos === 4) return team;
    }
    return null;
};

// 檢查班級在週二是否為大休
export const isTeamBigRestOnTuesday = (team: string, date: string): boolean => {
    const targetDate = new Date(date);
    // 檢查是否為週二
    if (targetDate.getDay() !== 2) return false;

    const shift = getShiftForDate(new Date(date), team);
    return shift === '大休';
};

// 尋找大休的班級成員
export const findBigRestMembers = (team: string, role: string, date: string): string[] => {
    const bigRestMembers: string[] = [];

    // 遍歷所有班級
    for (const [teamKey, teamData] of Object.entries(TEAMS)) {
        // 跳過請假人員所屬的班級
        if (teamKey === team) continue;

        // 檢查該班級當天是否為大休
        const shift = getShiftForDate(new Date(date), teamKey);
        if (shift === '大休') {
            // 根據角色篩選成員
            const members = teamData.members
                .filter(member => member.role === role)
                .map(member => member.name);
            bigRestMembers.push(...members);
        }
    }

    return bigRestMembers;
};

// 尋找一般班級成員
export const findRegularMembers = (team: string, role: string, date: string): string[] => {
    const regularMembers: string[] = [];

    // 遍歷所有班級
    for (const [teamKey, teamData] of Object.entries(TEAMS)) {
        // 跳過請假人員所屬的班級
        if (teamKey === team) continue;

        // 檢查該班級當天是否為正常上班
        const shift = getShiftForDate(new Date(date), teamKey);
        if (shift && shift !== '大休' && shift !== '小休') {
            // 根據角色篩選成員
            const members = teamData.members
                .filter(member => member.role === role)
                .map(member => member.name);
            regularMembers.push(...members);
        }
    }

    return regularMembers;
};

// 計算班級在一周內的差額
export const calculateTeamDeficit = (team: string, date: Date) => {
    const weekStart = startOfWeek(date, { weekStartsOn: 0 }); // 週日為一周之始
    const weekEnd = endOfWeek(date, { weekStartsOn: 0 }); // 週六為一周之末

    let bigRestDays = 0;
    let smallRestDays = 0;
    let currentDate = weekStart;

    // 計算這一周的班表
    while (currentDate <= weekEnd) {
        const dateStr = format(currentDate, 'yyyy-MM-dd');
        const shift = getShiftForDate(currentDate, team);
        if (shift === '大休') {
            bigRestDays++;
        } else if (shift === '小休') {
            smallRestDays++;
        }
        currentDate = addDays(currentDate, 1);
    }

    // 如果一周內只有一天休假（不論是小休或大休），則返回差額
    const totalRestDays = bigRestDays + smallRestDays;
    if (totalRestDays === 1) {
        return `${team}差額`;
    }

    return null;
}; 