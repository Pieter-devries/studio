'use client';

import { Card, CardContent } from '@/components/ui/card';

export function LoadingIndicator() {
  return (
    <Card className="w-full max-w-md mx-auto shadow-lg">
      <CardContent className="p-10 flex flex-col items-center justify-center text-center gap-6">
        <div className="w-16 h-16 border-4 border-dashed rounded-full animate-spin border-primary"></div>
        <div className="space-y-2">
          <h2 className="text-2xl font-bold font-headline">Crafting your video...</h2>
          <p className="text-muted-foreground">
            Our AI is synchronizing lyrics and generating a unique background. This might take a moment.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
