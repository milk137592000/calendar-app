'use client';

import React from 'react';
import { Team, TeamMember } from '@/types/schedule';

interface TeamMembersProps {
    team?: Team;
}

export default function TeamMembers({ team }: TeamMembersProps) {
    if (!team) return null;

    const leaders = team.members.filter(member => member.role === '班長');
    const members = team.members.filter(member => member.role === '班員');

    return (
        <div className="bg-white rounded-lg shadow-lg p-4 mb-4">
            <h3 className="text-lg font-semibold mb-4">{team.id}班成員</h3>
            <div className="space-y-4">
                <div>
                    <h4 className="text-sm font-medium text-gray-600 mb-2">班長</h4>
                    <div className="flex flex-wrap gap-2">
                        {leaders.map((member) => (
                            <span
                                key={member.name}
                                className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800"
                            >
                                {member.name}
                            </span>
                        ))}
                    </div>
                </div>
                <div>
                    <h4 className="text-sm font-medium text-gray-600 mb-2">班員</h4>
                    <div className="flex flex-wrap gap-2">
                        {members.map((member) => (
                            <span
                                key={member.name}
                                className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800"
                            >
                                {member.name}
                            </span>
                        ))}
                    </div>
                </div>
            </div>
        </div>
    );
} 