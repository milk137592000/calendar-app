'use client';

import React from 'react';
import {
    startOfMonth,
    endOfMonth,
    eachDayOfInterval,
    format,
    isSameDay,
    addMonths,
    subMonths,
    getDay
} from 'date-fns';
import CalendarCell from './CalendarCell';
import type { LeaveRecord } from '@/types/LeaveRecord';

interface CalendarProps {
    schedules: any[];
    currentDate: Date;
    onMonthChange: (date: Date) => void;
    selectedTeam?: string;
    isLeaveMode: boolean;
    leaveRecords: LeaveRecord[];
    onToggleLeave: (date: Date) => void;
    getLeaveRecordColor: (record: LeaveRecord) => string;
}

const WEEKDAYS = ['週日', '週一', '週二', '週三', '週四', '週五', '週六'];

// Helper function to check if a leave record still needs overtime
const checkIfNeedsOvertime = (record: LeaveRecord) => {
    // 全天請假的情況
    if (record.period === 'fullDay') {
        // 如果沒有設置加班資訊，表示需要加班
        if (!record.fullDayOvertime) return true;
        
        // 加整班的情況，檢查是否有確認的人員
        if (record.fullDayOvertime.type === '加整班') {
            return !record.fullDayOvertime.fullDayMember?.confirmed;
        }
        
        // 加一半的情況，檢查兩個時段是否都有確認的人員
        if (record.fullDayOvertime.type === '加一半') {
            const firstHalfFilled = record.fullDayOvertime.firstHalfMember?.confirmed;
            const secondHalfFilled = record.fullDayOvertime.secondHalfMember?.confirmed;
            return !firstHalfFilled || !secondHalfFilled;
        }
    }
    
    // 自定義時段請假的情況
    if (typeof record.period === 'object' && record.period.type === 'custom') {
        // 如果沒有設置加班資訊或未確認，表示需要加班
        return !record.customOvertime?.confirmed;
    }
    
    return false;
};

// Helper function to get the available teams for overtime
const getSuggestedTeams = (record: LeaveRecord, daySchedules: any) => {
    // 這個函數簡化版，實際邏輯在CalendarCell中更詳細
    if (!record || !daySchedules || !daySchedules.shifts) return [];
    
    const shifts = daySchedules.shifts;
    
    // 如果是全天請假，優先考慮大休班級
    if (record.period === 'fullDay') {
        for (const [team, shift] of Object.entries(shifts)) {
            if (shift === '大休') {
                return [team];
            }
        }
    }
    
    return [];
};

// Check if a day has leave records that need overtime and the selected team can provide it
const dayNeedsOvertimeFromTeam = (date: Date, leaveRecords: LeaveRecord[], schedules: any[], selectedTeam?: string) => {
    if (!selectedTeam) return false;
    
    const formattedDate = format(date, 'yyyy-MM-dd');
    const daySchedule = schedules.find(s => s.date === formattedDate);
    
    // 過濾出當天的請假記錄
    const dayLeaveRecords = leaveRecords.filter(r => r.date === formattedDate);
    
    // 如果沒有請假記錄，則不需要加班
    if (dayLeaveRecords.length === 0) return false;
    
    // 檢查是否有需要加班的請假記錄
    for (const record of dayLeaveRecords) {
        if (checkIfNeedsOvertime(record)) {
            // 檢查選定的班級是否可以支援加班
            const suggestedTeams = getSuggestedTeams(record, daySchedule);
            if (suggestedTeams.includes(selectedTeam)) {
                return true;
            }
        }
    }
    
    return false;
};

export default function Calendar({
    schedules,
    currentDate,
    onMonthChange,
    selectedTeam,
    isLeaveMode,
    leaveRecords,
    onToggleLeave,
    getLeaveRecordColor
}: CalendarProps) {
    const monthStart = startOfMonth(currentDate);
    const monthEnd = endOfMonth(currentDate);
    const days = eachDayOfInterval({ start: monthStart, end: monthEnd });
    
    // 計算需要填充的前置空白天數
    const startDay = getDay(monthStart);
    const emptyDays = Array(startDay).fill(null);

    const handlePrevMonth = () => {
        onMonthChange(subMonths(currentDate, 1));
    };

    const handleNextMonth = () => {
        onMonthChange(addMonths(currentDate, 1));
    };

    return (
        <div className="w-full max-w-[430px] mx-auto bg-white shadow-lg rounded-lg overflow-hidden px-0 sm:px-2">
            <div className="p-2 sm:p-4 border-b border-gray-200">
                <div className="flex justify-between items-center mb-2 sm:mb-4">
                    <button
                        onClick={handlePrevMonth}
                        className="px-2 sm:px-4 py-1 sm:py-2 text-xs sm:text-sm text-gray-600 hover:bg-gray-100 rounded"
                    >
                        上個月
                    </button>
                    <h2 className="text-base sm:text-2xl font-bold text-gray-800">
                        {format(currentDate, 'yyyy年M月')}
                        {selectedTeam && !isLeaveMode && ` · ${selectedTeam}`}
                        {isLeaveMode && ' · 請假'}
                    </h2>
                    <button
                        onClick={handleNextMonth}
                        className="px-2 sm:px-4 py-1 sm:py-2 text-xs sm:text-sm text-gray-600 hover:bg-gray-100 rounded"
                    >
                        下個月
                    </button>
                </div>
            </div>
            <div className="p-1 sm:p-4">
                <div className="grid grid-cols-7 sm:grid-cols-7 gap-0.5 sm:gap-1">
                    {WEEKDAYS.map((day) => (
                        <div
                            key={day}
                            className="text-center p-1 sm:p-2 bg-gray-50 text-xs sm:text-sm text-gray-600 font-medium"
                        >
                            {day}
                        </div>
                    ))}
                    {emptyDays.map((_, index) => (
                        <div key={`empty-${index}`} className="bg-gray-50" />
                    ))}
                    {days.map((day, index) => {
                        const daySchedule = schedules.find(s => 
                            s.date === format(day, 'yyyy-MM-dd')
                        );
                        const leaveRecord = leaveRecords.find(r => r.date === format(day, 'yyyy-MM-dd'));
                        const bgColor = leaveRecord ? getLeaveRecordColor(leaveRecord) : '';
                        const defaultShifts = { A: '早班', B: '早班', C: '早班', D: '早班' };
                        
                        return (
                            <div
                                key={index}
                                className={`aspect-[1/1.1] p-1 sm:p-2 border rounded-xl sm:rounded-lg cursor-pointer bg-white
                                    ${isSameDay(day, new Date()) ? 'border-red-500 border-2' : 'border-gray-200'}
                                    ${selectedTeam && !isLeaveMode && dayNeedsOvertimeFromTeam(day, leaveRecords, schedules, selectedTeam) ? 
                                      'border-yellow-400 border-2' : ''}
                                    hover:bg-gray-100 transition-colors`}
                                onClick={() => onToggleLeave(day)}
                            >
                                <CalendarCell
                                    date={day}
                                    shifts={daySchedule ? daySchedule.shifts : defaultShifts}
                                    isToday={isSameDay(day, new Date())}
                                    selectedTeam={selectedTeam}
                                    isLeaveMode={isLeaveMode}
                                    leaveRecords={leaveRecords.filter(r => r.date === format(day, 'yyyy-MM-dd')) as LeaveRecord[]}
                                    onToggleLeave={onToggleLeave}
                                    daySchedule={daySchedule || { date: format(day, 'yyyy-MM-dd'), shifts: defaultShifts }}
                                />
                            </div>
                        );
                    })}
                </div>
            </div>
        </div>
    );
} 