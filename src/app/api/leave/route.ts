import { NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import LeaveRecord from '@/models/LeaveRecord';

export async function GET(request: Request) {
    try {
        const { searchParams } = new URL(request.url);
        const date = searchParams.get('date');
        
        await connectDB();
        
        const query = date ? { date } : {};
        const records = await LeaveRecord.find(query).sort({ date: 1 });
        
        return NextResponse.json(records);
    } catch (error) {
        console.error('Error fetching leave records:', error);
        return NextResponse.json({ error: 'Failed to fetch leave records' }, { status: 500 });
    }
}

export async function POST(request: Request) {
    try {
        const body = await request.json();
        const { date, name, team, confirmed } = body;
        
        await connectDB();
        
        // 檢查是否已經請過假
        const existingRecord = await LeaveRecord.findOne({ date, name });
        if (existingRecord) {
            return NextResponse.json(
                { error: '該人員已經請過假' },
                { status: 400 }
            );
        }
        
        const newRecord = await LeaveRecord.create({
            date,
            name,
            team,
            confirmed,
            overtime: {
                type: 'regular',
                confirmed: false,
                firstConfirmed: false
            }
        });
        
        return NextResponse.json(newRecord);
    } catch (error) {
        console.error('Error creating leave record:', error);
        return NextResponse.json({ error: 'Failed to create leave record' }, { status: 500 });
    }
}

export async function PUT(request: Request) {
    try {
        const body = await request.json();
        const { date, name, ...updateData } = body;
        
        await connectDB();
        
        const updatedRecord = await LeaveRecord.findOneAndUpdate(
            { date, name },
            updateData,
            { new: true }
        );
        
        if (!updatedRecord) {
            return NextResponse.json(
                { error: 'Leave record not found' },
                { status: 404 }
            );
        }
        
        return NextResponse.json(updatedRecord);
    } catch (error) {
        console.error('Error updating leave record:', error);
        return NextResponse.json({ error: 'Failed to update leave record' }, { status: 500 });
    }
}

export async function DELETE(request: Request) {
    try {
        const conn = await connectDB();
        console.log('MongoDB connected successfully');
        
        const data = await request.json();
        const { date, name } = data;
        
        const record = await LeaveRecord.findOneAndDelete({ date, name });
        
        if (!record) {
            return NextResponse.json({ error: 'Leave record not found' }, { status: 404 });
        }
        
        return NextResponse.json({ message: 'Leave record deleted successfully' });
    } catch (error: any) {
        console.error('MongoDB DELETE error:', error);
        return NextResponse.json({ 
            error: 'Failed to delete leave record', 
            details: error?.message || 'Unknown error' 
        }, { status: 500 });
    }
} 