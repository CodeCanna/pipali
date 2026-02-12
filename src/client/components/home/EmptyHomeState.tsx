// Empty state when no active tasks on home page

import { useState } from 'react';

type TimeSlot = 'lateNight' | 'earlyMorning' | 'morning' | 'afternoon' | 'evening' | 'night';

function getTimeOfDay(hour: number): 'morning' | 'afternoon' | 'evening' {
    if (hour >= 17 || hour < 4) return 'evening';
    if (hour >= 12) return 'afternoon';
    return 'morning';
}

function getTimeSlot(hour: number): TimeSlot {
    if (hour >= 0 && hour < 4) return 'lateNight';
    if (hour >= 4 && hour < 7) return 'earlyMorning';
    if (hour >= 7 && hour < 12) return 'morning';
    if (hour >= 12 && hour < 17) return 'afternoon';
    if (hour >= 17 && hour < 21) return 'evening';
    return 'night';
}

function isWeekend(day: number): boolean {
    return day === 0 || day === 6;
}

function isFriday(day: number): boolean {
    return day === 5;
}

function isMonday(day: number): boolean {
    return day === 1;
}

function getGreeting(name?: string): string {
    const now = new Date();
    const hour = now.getHours();
    const dayOfWeek = now.getDay();
    const n = name ? `, ${name}` : '';
    const timeOfDay = getTimeOfDay(hour);
    const timeSlot = getTimeSlot(hour);
    const weekend = isWeekend(dayOfWeek);

    const greetings: string[] = [
        `Good ${timeOfDay}${n}! What's on your mind?`,
        `What shall we explore today?`,
        `What are we working on?`,
        `Hey${n}! How can I help?`,
        `What would you like to get done?`,
    ];

    if (timeSlot === 'lateNight') {
        greetings.push(
            `Burning the midnight oil${n}?`,
            `Still up? Must be something good`,
            `The quiet hours are the best for deep work`,
            `Night owl mode activated`,
            `The world's asleep — let's get things done`,
        );
    } else if (timeSlot === 'earlyMorning') {
        greetings.push(
            `You're up early${n}! What's the plan?`,
            `Early bird. The day is all yours`,
            `Up before the world. What's on your mind?`,
            `Fresh start to the day. What shall we tackle?`,
        );
    } else if (timeSlot === 'morning') {
        greetings.push(
            `Morning${n}! What shall we tackle?`,
            `Hey${n}! Ready to get things done?`,
            `What's the plan for today?`,
        );
        if (isMonday(dayOfWeek)) {
            greetings.push(
                `Happy Monday. Let's ease into the week`,
                `New week, fresh start. What's the priority?`,
            );
        }
    } else if (timeSlot === 'afternoon') {
        greetings.push(
            `Afternoon${n}! How can I help?`,
            `What are you thinking about?`,
            `What's next on the list?`,
            `How's the day going?`,
        );
    } else if (timeSlot === 'evening') {
        greetings.push(
            `Good evening${n}! What's on the agenda?`,
            `Winding down or gearing up?`,
            `Evening. What shall we dig into?`,
        );
        if (isFriday(dayOfWeek)) {
            greetings.push(
                `Happy Friday${n}! Wrapping up for the week?`,
                `Friday evening. Almost there!`,
            );
        }
    } else {
        greetings.push(
            `Hey${n}! Working late?`,
            `Quiet evening. What shall we dig into?`,
            `Winding down? Or just getting started?`,
        );
    }

    if (weekend) {
        greetings.push(
            `Happy weekend${n}! Working on something fun?`,
            `Weekend mode. What's the passion project?`,
            `No rush today. What do you want to explore?`,
        );
    }

    if (isFriday(dayOfWeek) && timeSlot === 'afternoon') {
        greetings.push(
            `Friday afternoon. Home stretch!`,
            `Almost weekend${n}! What's left to wrap up?`,
        );
    }

    return greetings[Math.floor(Math.random() * greetings.length)] as string;
}

interface EmptyHomeStateProps {
    userName?: string;
}

export function EmptyHomeState({ userName }: EmptyHomeStateProps) {
    const [greeting] = useState(() => getGreeting(userName));

    return (
        <div className="empty-state home-empty">
            <h2>{greeting}</h2>
        </div>
    );
}
