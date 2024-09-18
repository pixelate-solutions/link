// sharedState.ts
import { useState, useEffect } from 'react';
import axios from 'axios';
import { useUser } from "@clerk/nextjs";

type Listener = (value: number) => void;

let usedTransactions = 0;
let listeners: Listener[] = [];

export const setUsedTransactions = (value: number) => {
    usedTransactions = value;
    listeners.forEach((listener) => listener(usedTransactions));
};

export const getUsedTransactions = () => usedTransactions;

export const useSharedTransactions = () => {
    const [state, setState] = useState(usedTransactions);
    const { user } = useUser();
    const userId = user?.id;

    useEffect(() => {
        const fetchTransactions = async () => {
            if (!userId) return;
            try {
                const response = await axios.get(`${process.env.NEXT_PUBLIC_API_URL}/api/get_transactions/${userId}`);
                setUsedTransactions(response.data);
            } catch (error) {
                console.error("Failed to fetch user transactions", error);
            }
        };

        fetchTransactions();
    }, [userId]);

    useEffect(() => {
        const listener: Listener = (newValue) => {
            setState(newValue);
        };

        listeners.push(listener);
        return () => {
            listeners = listeners.filter((l) => l !== listener);
        };
    }, []);

    return state;
};
