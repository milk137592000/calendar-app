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
            { name: '陳建良', role: '操作員' },
            { name: '陳建豪', role: '操作員' },
            { name: '陳建志', role: '操作員' },
            { name: '陳建銘', role: '操作員' },
            { name: '陳建宏', role: '操作員' }
        ]
    },
    'B': {
        members: [
            { name: '林志明', role: '操作員' },
            { name: '林志豪', role: '操作員' },
            { name: '林志偉', role: '操作員' },
            { name: '林志強', role: '操作員' },
            { name: '林志成', role: '操作員' }
        ]
    },
    'C': {
        members: [
            { name: '王建國', role: '操作員' },
            { name: '王建民', role: '操作員' },
            { name: '王建勳', role: '操作員' },
            { name: '王建文', role: '操作員' },
            { name: '王建忠', role: '操作員' }
        ]
    },
    'D': {
        members: [
            { name: '李志豪', role: '操作員' },
            { name: '李志偉', role: '操作員' },
            { name: '李志明', role: '操作員' },
            { name: '李志強', role: '操作員' },
            { name: '李志成', role: '操作員' }
        ]
    }
}; 