import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Phone, MessageCircle, Send, Facebook } from "lucide-react";

interface ContactDialogProps {
  isOpen: boolean;
  onClose: () => void;
}

const contacts = [
  {
    name: "Viber",
    icon: Phone,
    color: "bg-purple-500",
    link: "viber://chat?number=+959967793288",
    display: "09967793288"
  },
  {
    name: "Telegram",
    icon: Send,
    color: "bg-blue-500",
    link: "https://t.me/KoNay2027",
    display: "@KoNay2027"
  },
  {
    name: "Messenger",
    icon: MessageCircle,
    color: "bg-gradient-to-r from-blue-500 to-purple-500",
    link: "https://m.me/NAYWIN2027",
    display: "NAYWIN2027"
  },
  {
    name: "Facebook",
    icon: Facebook,
    color: "bg-blue-600",
    link: "https://www.facebook.com/NAYWIN2027",
    display: "NAYWIN2027"
  }
];

export function ContactDialog({ isOpen, onClose }: ContactDialogProps) {
  const handleContactClick = (link: string) => {
    window.open(link, "_blank");
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-sm bg-background/95 backdrop-blur-xl border-border/30">
        <DialogHeader>
          <DialogTitle className="text-center text-foreground">Contact Us</DialogTitle>
        </DialogHeader>
        
        <div className="grid grid-cols-2 gap-3 py-4">
          {contacts.map((contact) => (
            <button
              key={contact.name}
              onClick={() => handleContactClick(contact.link)}
              className="flex flex-col items-center gap-2 p-4 rounded-xl bg-card/50 border border-border/30 hover:bg-card/80 hover:border-primary/30 transition-all duration-200 group"
            >
              <div className={`w-12 h-12 rounded-full ${contact.color} flex items-center justify-center shadow-lg group-hover:scale-110 transition-transform`}>
                <contact.icon className="w-6 h-6 text-white" />
              </div>
              <div className="text-center">
                <p className="text-2xs font-semibold text-foreground">{contact.name}</p>
                <p className="text-3xs text-muted-foreground truncate max-w-[100px]">{contact.display}</p>
              </div>
            </button>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
