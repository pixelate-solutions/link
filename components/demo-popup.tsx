'use client';

import * as React from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';

interface DemoPopupProps {
  isOpen: boolean;
  onClose: () => void;
}

export function DemoPopup({ isOpen, onClose }: DemoPopupProps) {
  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Welcome to the Demo Site</DialogTitle>
          <DialogDescription>
            This is just a demo site – not all functionality is available, but in a live site, all features would be built out with the full style and functionality.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button className='hover:cursor-pointer' onClick={onClose}>Got it!</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
