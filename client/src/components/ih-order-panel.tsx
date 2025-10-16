import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { format, parseISO } from "date-fns";
import { useToast } from "@/hooks/use-toast";
import { Package, Truck, CheckCircle, Clock, MessageSquare, Save, Plus, CalendarIcon } from "lucide-react";

interface IHOrderPanelProps {
  order: any;
  onUpdate?: () => void;
}

const carriers = [
  { value: "UPS", label: "UPS" },
  { value: "FEDEX", label: "FedEx" },
  { value: "USPS", label: "USPS" },
  { value: "OTHER", label: "Other" }
];

export function IHOrderPanel({ order, onUpdate }: IHOrderPanelProps) {
  const { toast } = useToast();
  const [ihStatus, setIhStatus] = useState(order.ihStatus || "");
  // Parse ihMeta if it's a string
  const parseIhMeta = (meta: any) => {
    if (!meta) return { rsrReceiptDate: "", internalTrackingNumber: "", outboundCarrier: "", outboundTracking: "", notes: [] };
    if (typeof meta === 'string') {
      try {
        return JSON.parse(meta);
      } catch (e) {
        console.error('Failed to parse ihMeta:', e);
        return { rsrReceiptDate: "", internalTrackingNumber: "", outboundCarrier: "", outboundTracking: "", notes: [] };
      }
    }
    return meta;
  };
  
  const [ihMeta, setIhMeta] = useState(parseIhMeta(order.ihMeta));
  const [newNote, setNewNote] = useState("");
  const [isEditingMeta, setIsEditingMeta] = useState(false);

  // Check if this is an IH order
  // Parse fulfillmentGroups if it's a string
  let fulfillmentGroups = [];
  if (order.fulfillmentGroups) {
    if (typeof order.fulfillmentGroups === 'string') {
      try {
        fulfillmentGroups = JSON.parse(order.fulfillmentGroups);
      } catch (e) {
        console.error('Failed to parse fulfillmentGroups:', e);
        fulfillmentGroups = [];
      }
    } else {
      fulfillmentGroups = order.fulfillmentGroups;
    }
  }
  
  // Check both fulfillmentGroups and fulfillmentType for compatibility
  const isIHOrder = fulfillmentGroups.some((group: any) => group.fulfillmentType === 'ih_ffl') ||
                    order.fulfillmentType === 'ih_ffl';

  // Update IH status mutation
  const updateStatusMutation = useMutation({
    mutationFn: async (data: any) => {
      const response = await apiRequest(`/api/orders/${order.id}/status`, {
        method: "PATCH",
        body: JSON.stringify(data)
      });
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || "Failed to update IH status");
      }
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "Success",
        description: "IH status updated successfully"
      });
      queryClient.invalidateQueries({ queryKey: ['/api/orders'] });
      if (onUpdate) onUpdate();
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive"
      });
    }
  });

  // Add note mutation
  const addNoteMutation = useMutation({
    mutationFn: async (noteText: string) => {
      const response = await apiRequest(`/api/orders/${order.id}/notes`, {
        method: "POST",
        body: JSON.stringify({ note: noteText })
      });
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || "Failed to add note");
      }
      return response.json();
    },
    onSuccess: (data) => {
      toast({
        title: "Success",
        description: "Note added successfully"
      });
      setNewNote("");
      // Update local state with new note
      setIhMeta((prev: any) => ({
        ...prev,
        notes: [...(prev.notes || []), data.note]
      }));
      queryClient.invalidateQueries({ queryKey: ['/api/orders'] });
      if (onUpdate) onUpdate();
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive"
      });
    }
  });

  if (!isIHOrder) {
    return null;
  }

  const handleSaveIHDetails = () => {
    updateStatusMutation.mutate({
      ihStatus,
      ihMeta: {
        rsrReceiptDate: ihMeta.rsrReceiptDate,
        internalTrackingNumber: ihMeta.internalTrackingNumber,
        outboundCarrier: ihMeta.outboundCarrier,
        outboundTracking: ihMeta.outboundTracking
      }
    });
    setIsEditingMeta(false);
  };

  const handleAddNote = () => {
    if (newNote.trim()) {
      addNoteMutation.mutate(newNote.trim());
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'RECEIVED_FROM_RSR':
        return <Package className="w-4 h-4" />;
      case 'SENT_OUTBOUND':
        return <Truck className="w-4 h-4" />;
      case 'ORDER_COMPLETE':
        return <CheckCircle className="w-4 h-4" />;
      default:
        return <Clock className="w-4 h-4" />;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'RECEIVED_FROM_RSR':
        return 'bg-blue-100 text-blue-800';
      case 'SENT_OUTBOUND':
        return 'bg-indigo-100 text-indigo-800';
      case 'ORDER_COMPLETE':
        return 'bg-green-100 text-green-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  return (
    <Card className="mt-6">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Package className="w-5 h-5" />
          In-House Firearm Fulfillment
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-6">
          {/* Current Status */}
          <div>
            <Label>Current IH Status</Label>
            <div className="mt-2">
              {ihStatus ? (
                <Badge className={`gap-1 ${getStatusColor(ihStatus)}`}>
                  {getStatusIcon(ihStatus)}
                  {ihStatus.replace(/_/g, ' ')}
                </Badge>
              ) : (
                <Badge variant="outline">Not Set</Badge>
              )}
            </div>
          </div>

          {/* IH Status Update */}
          <div className="space-y-4">
            <div>
              <Label htmlFor="ih-status">Update IH Status</Label>
              <Select value={ihStatus} onValueChange={setIhStatus}>
                <SelectTrigger id="ih-status" className="mt-2">
                  <SelectValue placeholder="Select IH status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="RECEIVED_FROM_RSR">Received from RSR</SelectItem>
                  <SelectItem value="SENT_OUTBOUND">Sent Outbound</SelectItem>
                  <SelectItem value="ORDER_COMPLETE">Order Complete</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* IH Meta Fields */}
            {isEditingMeta ? (
              <div className="space-y-4 p-4 border rounded-lg bg-gray-50">
                <div>
                  <Label htmlFor="rsr-receipt-date">RSR Receipt Date</Label>
                  <Input
                    id="rsr-receipt-date"
                    type="date"
                    value={ihMeta.rsrReceiptDate || ''}
                    onChange={(e) => setIhMeta({ ...ihMeta, rsrReceiptDate: e.target.value })}
                    className="mt-1"
                  />
                </div>

                <div>
                  <Label htmlFor="internal-tracking">Internal Tracking Number</Label>
                  <Input
                    id="internal-tracking"
                    value={ihMeta.internalTrackingNumber || ''}
                    onChange={(e) => setIhMeta({ ...ihMeta, internalTrackingNumber: e.target.value })}
                    placeholder="Enter internal tracking number"
                    className="mt-1"
                  />
                </div>

                <div>
                  <Label htmlFor="outbound-carrier">Outbound Carrier</Label>
                  <Select 
                    value={ihMeta.outboundCarrier || ''} 
                    onValueChange={(value) => setIhMeta({ ...ihMeta, outboundCarrier: value })}
                  >
                    <SelectTrigger id="outbound-carrier" className="mt-1">
                      <SelectValue placeholder="Select carrier" />
                    </SelectTrigger>
                    <SelectContent>
                      {carriers.map(carrier => (
                        <SelectItem key={carrier.value} value={carrier.value}>
                          {carrier.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label htmlFor="outbound-tracking">Outbound Tracking Number</Label>
                  <Input
                    id="outbound-tracking"
                    value={ihMeta.outboundTracking || ''}
                    onChange={(e) => setIhMeta({ ...ihMeta, outboundTracking: e.target.value })}
                    placeholder="Enter tracking number"
                    className="mt-1"
                  />
                </div>

                <div className="flex gap-2">
                  <Button onClick={handleSaveIHDetails} disabled={updateStatusMutation.isPending}>
                    <Save className="w-4 h-4 mr-2" />
                    Save IH Details
                  </Button>
                  <Button variant="outline" onClick={() => setIsEditingMeta(false)}>
                    Cancel
                  </Button>
                </div>
              </div>
            ) : (
              <div>
                {/* Display current meta info */}
                <div className="space-y-2 p-4 border rounded-lg bg-gray-50">
                  {ihMeta.rsrReceiptDate && (
                    <div className="flex justify-between">
                      <span className="text-sm font-medium">RSR Receipt Date:</span>
                      <span className="text-sm">{format(parseISO(ihMeta.rsrReceiptDate), 'MMM dd, yyyy')}</span>
                    </div>
                  )}
                  {ihMeta.internalTrackingNumber && (
                    <div className="flex justify-between">
                      <span className="text-sm font-medium">Internal Tracking:</span>
                      <span className="text-sm font-mono">{ihMeta.internalTrackingNumber}</span>
                    </div>
                  )}
                  {ihMeta.outboundCarrier && (
                    <div className="flex justify-between">
                      <span className="text-sm font-medium">Carrier:</span>
                      <span className="text-sm">{ihMeta.outboundCarrier}</span>
                    </div>
                  )}
                  {ihMeta.outboundTracking && (
                    <div className="flex justify-between">
                      <span className="text-sm font-medium">Tracking Number:</span>
                      <span className="text-sm font-mono">{ihMeta.outboundTracking}</span>
                    </div>
                  )}
                </div>
                <Button 
                  variant="outline" 
                  size="sm" 
                  onClick={() => setIsEditingMeta(true)}
                  className="mt-2"
                >
                  Edit IH Details
                </Button>
              </div>
            )}
          </div>

          <Separator />

          {/* FFL Destination */}
          {order.persistedFfl && (
            <div>
              <Label>FFL Destination</Label>
              <div className="mt-2 p-4 border rounded-lg bg-gray-50">
                <div className="space-y-2">
                  <div>
                    <span className="font-medium">{order.persistedFfl.name}</span>
                  </div>
                  <div className="text-sm text-gray-600">
                    ATF #: {order.persistedFfl.atfNumber}
                  </div>
                  <div className="text-sm text-gray-600">
                    {order.persistedFfl.street}, {order.persistedFfl.city}, {order.persistedFfl.state} {order.persistedFfl.zip}
                  </div>
                  {order.persistedFfl.phone && (
                    <div className="text-sm text-gray-600">
                      Phone: {order.persistedFfl.phone}
                    </div>
                  )}
                  {order.persistedFfl.email && (
                    <div className="text-sm text-gray-600">
                      Email: {order.persistedFfl.email}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          <Separator />

          {/* Notes Section */}
          <div>
            <Label>Internal Notes</Label>
            <div className="mt-2">
              <ScrollArea className="h-48 w-full rounded-md border p-4">
                {ihMeta.notes && ihMeta.notes.length > 0 ? (
                  <div className="space-y-3">
                    {ihMeta.notes.map((note: any) => (
                      <div key={note.id} className="border-b pb-2 last:border-0">
                        <div className="flex justify-between items-start">
                          <p className="text-sm">{note.text}</p>
                          <Badge variant="outline" className="text-xs ml-2 shrink-0">
                            {format(parseISO(note.timestamp), 'MMM dd, HH:mm')}
                          </Badge>
                        </div>
                        <p className="text-xs text-gray-500 mt-1">by {note.adminEmail}</p>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-gray-500">No notes yet</p>
                )}
              </ScrollArea>

              <div className="mt-3 space-y-2">
                <Textarea
                  value={newNote}
                  onChange={(e) => setNewNote(e.target.value)}
                  placeholder="Add an internal note (visible to staff only)"
                  className="min-h-20"
                />
                <Button 
                  onClick={handleAddNote} 
                  disabled={!newNote.trim() || addNoteMutation.isPending}
                >
                  <Plus className="w-4 h-4 mr-2" />
                  Add Note
                </Button>
              </div>
            </div>
          </div>

          {/* Validation Messages */}
          {ihStatus === 'SENT_OUTBOUND' && (!ihMeta.outboundCarrier || !ihMeta.outboundTracking) && (
            <Alert>
              <AlertDescription>
                <strong>Note:</strong> SENT_OUTBOUND status requires both carrier and tracking number to be set.
              </AlertDescription>
            </Alert>
          )}

          {ihStatus === 'ORDER_COMPLETE' && !ihMeta.outboundTracking && (!ihMeta.notes || ihMeta.notes.length === 0) && (
            <Alert>
              <AlertDescription>
                <strong>Note:</strong> ORDER_COMPLETE status requires delivery confirmation or FFL pickup note.
              </AlertDescription>
            </Alert>
          )}
        </div>
      </CardContent>
    </Card>
  );
}