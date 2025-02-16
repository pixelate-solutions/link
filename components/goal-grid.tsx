"use client";

import React, { useEffect, useState } from "react";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogTrigger,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle as ADTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogAction,
  AlertDialogCancel,
} from "@/components/ui/alert-dialog";
import GoalPlannerForm from "@/components/goal-planner-form";
import { formatCurrency } from "@/lib/utils";

// Import the updated GoalProgressChart component
import GoalProgressChart from "@/components/goal-chart";

const toLocalDate = (dateStr: string): Date => {
  const [datePart] = dateStr.split("T");
  const [year, month, day] = datePart.split("-").map(Number);
  return new Date(year, month - 1, day);
};

interface Goal {
  id: string;
  goalName: string;
  targetAmount: string;
  startDate: string;  // New field
  goalDate: string;
  accountIds: string;
}

interface Account {
  id: string;
  name: string;
}

interface GoalGridProps {
  accounts: Account[];
}

interface GoalProgressData {
  currentAmount: number;
  targetAmount: number;
  percentage: number; // 0 to 100
  advice: string;
  chartData?: {
    actualData?: { label: string; value: number }[];
    projectedData?: { label: string; value: number }[];
  };
}

const GoalGrid: React.FC<GoalGridProps> = ({ accounts }) => {
  const [goals, setGoals] = useState<Goal[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);

  // State for the selected goal and its progress info.
  const [selectedGoal, setSelectedGoal] = useState<Goal | null>(null);
  const [progressData, setProgressData] = useState<GoalProgressData | null>(null);
  const [isProgressLoading, setIsProgressLoading] = useState(false);

  const fetchGoals = async () => {
    setIsLoading(true);
    const res = await fetch("/api/goals");
    const json = await res.json();
    if (res.ok) {
      setGoals(json.data);
    }
    setIsLoading(false);
  };

  useEffect(() => {
    fetchGoals();
  }, []);

  // Fetch progress data for a goal.
  const fetchGoalProgress = async (goal: Goal) => {
    setIsProgressLoading(true);
    try {
      const res = await fetch(`/api/goals/goal-progress?goalId=${goal.id}`);
      if (res.ok) {
        const json = await res.json();
        setProgressData(json.data);
      } else {
        console.error("Failed to fetch goal progress");
        setProgressData(null);
      }
    } catch (error) {
      console.error("Error fetching goal progress", error);
      setProgressData(null);
    }
    setIsProgressLoading(false);
  };

  const handleDelete = async (id: string) => {
    const res = await fetch(`/api/goals/${id}`, { method: "DELETE" });
    if (res.ok) {
      if (selectedGoal?.id === id) {
        setSelectedGoal(null);
        setProgressData(null);
      }
      fetchGoals();
    } else {
      alert("Failed to delete goal.");
    }
  };

  // Handler for when a goal card (except its buttons) is clicked.
  const handleGoalSelect = (goal: Goal) => {
    setSelectedGoal(goal);
    fetchGoalProgress(goal);
  };

  return (
    <div className="mt-10">
      {/* Display progress data for the selected goal */}
      {selectedGoal && (
        <Card className="mb-6 px-4">
          <CardHeader className="flex justify-between items-center">
            <CardTitle>{selectedGoal.goalName} Progress</CardTitle>
          </CardHeader>
          <CardContent>
            {isProgressLoading ? (
              <p className="w-full text-center py-[50px] text-lg text-gray-400">
                Loading progress...
              </p>
            ) : progressData ? (
              <>
                <p>
                  <strong>Progress: </strong>
                  {formatCurrency(progressData.currentAmount)} of{" "}
                  {formatCurrency(Number(selectedGoal.targetAmount))} (
                  {progressData.percentage.toFixed(0)}%)
                </p>
                <div className="w-full bg-gray-200 rounded-full h-4 my-2">
                  <div
                    className="bg-green-500 h-4 rounded-full"
                    style={{
                      width: `${progressData.percentage >= 0 ? progressData.percentage : 0}%`,
                    }}
                  ></div>
                </div>
                {/* Render the updated GoalProgressChart component */}
                {progressData && selectedGoal && (
                  <GoalProgressChart
                    currentAmount={progressData.currentAmount}
                    goalId={selectedGoal.id}
                    // For this example, we use the first account from accountIds.
                    accountId={JSON.parse(selectedGoal.accountIds)[0] || ""}
                    goalStartDate={selectedGoal.startDate}
                  />
                )}
                <p className="mt-5 bg-gray-100 rounded-full p-2">
                  <strong>Notes: </strong>
                  {progressData.advice}
                </p>
              </>
            ) : (
              <p>No progress data available.</p>
            )}
          </CardContent>
        </Card>
      )}

      <div className="flex justify-between items-center mb-4">
        <h2 className="text-2xl font-bold">Your Goals</h2>
        <p className="text-gray-400">Click goal to view progress.</p>
        <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
          <DialogTrigger asChild>
            <Button
              className="bg-blue-600 hover:bg-blue-500"
              onClick={() => setCreateDialogOpen(true)}
            >
              Create Goal
            </Button>
          </DialogTrigger>
          <DialogContent className="rounded-lg w-[98%]">
            <DialogHeader>
              <DialogTitle>Create Goal</DialogTitle>
            </DialogHeader>
            <GoalPlannerForm
              accounts={accounts}
              onSuccess={() => {
                fetchGoals();
                setCreateDialogOpen(false);
              }}
            />
          </DialogContent>
        </Dialog>
      </div>

      {isLoading ? (
        <p className="text-center w-full my-[100px] text-gray-500">Loading goals...</p>
      ) : goals.length === 0 ? (
        <p className="text-center w-full my-[100px] text-gray-500">
          Create goals to see them here.
        </p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {goals.map((goal) => {
            const accountIds: string[] = goal.accountIds ? JSON.parse(goal.accountIds) : [];
            return (
              <Card
                key={goal.id}
                className={`hover:scale-[102%] shadow-sm transition-all hover:cursor-pointer ${
                  goal.id === selectedGoal?.id
                    ? "shadow-[0_0_12px_rgba(59,0,255,0.76)]"
                    : ""
                }`}
                onClick={() => handleGoalSelect(goal)}
              >
                <CardHeader>
                  <CardTitle>{goal.goalName}</CardTitle>
                </CardHeader>
                <CardContent>
                  <p>
                    <strong>Target: </strong>
                    {formatCurrency(Number(goal.targetAmount))}
                  </p>
                  <p>
                    <strong>Start Date: </strong>
                    {goal.startDate ? toLocalDate(goal.startDate).toLocaleDateString() : "No Date"}
                  </p>
                  <p>
                    <strong>Goal Date: </strong>
                    {goal.goalDate ? toLocalDate(goal.goalDate).toLocaleDateString() : "No Date"}
                  </p>
                  <p>
                    <strong>Accounts: </strong>
                    {accounts
                      .filter((a) => accountIds.includes(a.id))
                      .map((a) => a.name)
                      .join(", ")}
                  </p>
                </CardContent>
                <CardFooter className="flex justify-end space-x-2">
                  <Dialog>
                    <DialogTrigger asChild>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={(e) => e.stopPropagation()}
                      >
                        Edit
                      </Button>
                    </DialogTrigger>
                    <DialogContent className="rounded-lg w-[98%]">
                      <DialogHeader>
                        <DialogTitle>Edit Goal</DialogTitle>
                      </DialogHeader>
                      <GoalPlannerForm
                        accounts={accounts}
                        initialData={{
                          id: goal.id,
                          goalName: goal.goalName,
                          targetAmount: goal.targetAmount,
                          startDate: goal.startDate,
                          goalDate: goal.goalDate,
                          accountIds: JSON.parse(goal.accountIds),
                        }}
                        onSuccess={() => {
                          fetchGoals();
                        }}
                      />
                    </DialogContent>
                  </Dialog>
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button
                        variant="destructive"
                        size="sm"
                        onClick={(e) => e.stopPropagation()}
                      >
                        Delete
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <ADTitle>Are you absolutely sure?</ADTitle>
                        <AlertDialogDescription>
                          This action cannot be undone. This will permanently delete the goal.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction onClick={() => handleDelete(goal.id)}>
                          Continue
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </CardFooter>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default GoalGrid;
