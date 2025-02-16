"use client";

import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { CalendarIcon } from "lucide-react";
import { DatePicker } from "@/components/date-picker";
import { addHours } from "date-fns";

interface Account {
  id: string;
  name: string;
}

interface GoalFormProps {
  accounts: Account[];
  initialData?: {
    id: string;
    goalName: string;
    targetAmount: string;
    startDate: string;
    goalDate: string;
    accountIds: string[];
  };
  onSuccess: () => void;
}

const GoalPlannerForm: React.FC<GoalFormProps> = ({ accounts, initialData, onSuccess }) => {
  const [goalName, setGoalName] = useState(initialData?.goalName || "");
  const [targetAmount, setTargetAmount] = useState(initialData?.targetAmount || "");
  // For the date pickers, we store a Date object.
  const [startDate, setStartDate] = useState<Date>(
    initialData?.startDate ? addHours(new Date(initialData.startDate), 12) : new Date()
  );
  const [goalDate, setGoalDate] = useState<Date>(
    initialData?.goalDate ? addHours(new Date(initialData.goalDate), 12) : new Date()
  );
  const [selectedAccounts, setSelectedAccounts] = useState<string[]>(initialData?.accountIds || []);

  const isEditMode = Boolean(initialData?.id);

  const toggleAccount = (accountId: string) => {
    if (selectedAccounts.includes(accountId)) {
      setSelectedAccounts(selectedAccounts.filter((id) => id !== accountId));
    } else {
      setSelectedAccounts([...selectedAccounts, accountId]);
    }
  };

  const handleSubmit = async () => {
    // Normalize the dates to noon local time
    const normalizedStartDate = new Date(startDate);
    normalizedStartDate.setHours(12, 0, 0, 0);
    const normalizedGoalDate = new Date(goalDate);
    normalizedGoalDate.setHours(12, 0, 0, 0);

    const payload = {
      goalName,
      targetAmount: parseFloat(targetAmount).toString(),
      startDate: normalizedStartDate.toISOString(),
      goalDate: normalizedGoalDate.toISOString(),
      accountIds: selectedAccounts,
    };

    const endpoint = isEditMode ? `/api/goals/${initialData?.id}` : "/api/goals";
    const method = isEditMode ? "PATCH" : "POST";

    const res = await fetch(endpoint, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (res.ok) {
      onSuccess();
    } else {
      console.log(JSON.stringify(data.error) || "An error occurred.");
    }
  };

  return (
    <div className="space-y-4">
      <div>
        <Label className="block mb-1">Goal Name</Label>
        <Input
          type="text"
          value={goalName}
          onChange={(e) => setGoalName(e.target.value)}
          placeholder="Vacation Fund"
        />
      </div>
      <div>
        <Label className="block mb-1">Target Amount ($)</Label>
        <Input
          type="number"
          value={targetAmount}
          onChange={(e) => setTargetAmount(e.target.value)}
          placeholder="5000"
        />
      </div>
      <div>
        <Label className="block mb-1">Start Date</Label>
        <DatePicker
          value={startDate}
          onChange={(date) => {
            if (date) setStartDate(date);
          }}
        >
          <Button variant="outline" className="w-full justify-start text-left">
            <CalendarIcon className="mr-2 h-4 w-4" />
            {startDate ? startDate.toLocaleDateString() : "Select date"}
          </Button>
        </DatePicker>
      </div>
      <div>
        <Label className="block mb-1">Goal Date</Label>
        <DatePicker
          value={goalDate}
          onChange={(date) => {
            if (date) setGoalDate(date);
          }}
        >
          <Button variant="outline" className="w-full justify-start text-left">
            <CalendarIcon className="mr-2 h-4 w-4" />
            {goalDate ? goalDate.toLocaleDateString() : "Select date"}
          </Button>
        </DatePicker>
      </div>
      <div>
        <Label className="block mb-1">Select Accounts</Label>
        <div className="space-y-2">
          {accounts.map((account) => (
            <button onClick={() => toggleAccount(account.id)} key={account.id} className="flex items-center space-x-2">
              <Checkbox
                className="border-gray-300 h-5 w-5 text-white"
                checked={selectedAccounts.includes(account.id)}
                onCheckedChange={() => toggleAccount(account.id)}
              />
              <span>{account.name}</span>
            </button>
          ))}
        </div>
        {selectedAccounts.length === 0 && (
          <p className="text-red-500 text-sm mt-1">Select at least one account.</p>
        )}
      </div>
      <div className="w-full">
        <Button onClick={handleSubmit} disabled={!goalName || !targetAmount || !startDate || !goalDate || selectedAccounts.length === 0} className="mt-4 w-full bg-blue-600 hover:bg-blue-500">
          {isEditMode ? "Update Goal" : "Create Goal"}
        </Button>
      </div>
    </div>
  );
};

export default GoalPlannerForm;
