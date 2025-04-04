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
import { DaySchedule, LeaveRecord } from '@/types/schedule';

interface CalendarProps {
    schedules: DaySchedule[];
    currentDate: Date;
    onMonthChange: (date: Date) => void;
    selectedTeam?: string;
    isLeaveMode: boolean;
    leaveRecords: LeaveRecord[];
    onToggleLeave: (date: Date) => void;
    getLeaveRecordColor: (record: LeaveRecord) => string;
}

const WEEKDAYS = ['週日', '週一', '週二', '週三', '週四', '週五', '週六'];

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
        <div className="w-full max-w-7xl mx-auto bg-white shadow-lg rounded-lg overflow-hidden">
            <div className="p-4 border-b border-gray-200">
                <div className="flex justify-between items-center mb-4">
                    <button
                        onClick={handlePrevMonth}
                        className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded"
                    >
                        上個月
                    </button>
                    <h2 className="text-2xl font-bold text-gray-800">
                        {format(currentDate, 'yyyy年M月')}
                        {selectedTeam && !isLeaveMode && ` · ${selectedTeam}`}
                        {isLeaveMode && ' · 請假'}
                    </h2>
                    <button
                        onClick={handleNextMonth}
                        className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded"
                    >
                        下個月
                    </button>
                </div>
            </div>
            <div className="p-4">
                <div className="grid grid-cols-7 gap-1">
                    {WEEKDAYS.map((day) => (
                        <div
                            key={day}
                            className="text-center p-2 bg-gray-50 text-gray-600 font-medium"
                        >
                            {day}
                        </div>
                    ))}
                    {emptyDays.map((_, index) => (
                        <div key={`empty-${index}`} className="bg-gray-50" />
                    ))}
                    {days.map((day, index) => {
                        const daySchedule = schedules.find(s => 
                            format(s.date, 'yyyy-MM-dd') === format(day, 'yyyy-MM-dd')
                        );
                        const leaveRecord = leaveRecords.find(r => r.date === format(day, 'yyyy-MM-dd'));
                        const bgColor = leaveRecord ? getLeaveRecordColor(leaveRecord) : '';
                        
                        return (
                            <div
                                key={index}
                                className={`
                                    aspect-square p-2 border rounded-lg cursor-pointer
                                    ${daySchedule?.isHoliday ? 'bg-red-50' : ''}
                                    ${bgColor}
                                    ${isSameDay(day, new Date()) ? 'border-blue-500' : ''}
                                    ${isSameDay(day, new Date()) ? 'bg-white' : 'bg-gray-50'}
                                    hover:bg-gray-50 transition-colors
                                `}
                                onClick={() => onToggleLeave(day)}
                            >
                                <CalendarCell
                                    date={day}
                                    shifts={daySchedule?.shifts || []}
                                    isToday={isSameDay(day, new Date())}
                                    lunarDate={daySchedule?.lunarDate}
                                    selectedTeam={selectedTeam}
                                    isLeaveMode={isLeaveMode}
                                    leaveRecords={leaveRecords.filter(r => r.date === format(day, 'yyyy-MM-dd'))}
                                    onToggleLeave={onToggleLeave}
                                />
                            </div>
                        );
                    })}
                </div>
            </div>
        </div>
    );
} 