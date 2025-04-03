export interface TeamMember {
    name: string;
    role: string;
}

export interface Team {
    members: TeamMember[];
}

export const TEAMS: Record<string, Team> = {
    'A': {
        members: [
            { name: '張三', role: '操作員' },
            { name: '李四', role: '操作員' },
            // ... 其他成員
        ]
    },
    'B': {
        members: [
            { name: '王五', role: '操作員' },
            { name: '趙六', role: '操作員' },
            // ... 其他成員
        ]
    },
    'C': {
        members: [
            { name: '孫七', role: '操作員' },
            { name: '周八', role: '操作員' },
            // ... 其他成員
        ]
    },
    'D': {
        members: [
            { name: '吳九', role: '操作員' },
            { name: '鄭十', role: '操作員' },
            // ... 其他成員
        ]
    }
}; 