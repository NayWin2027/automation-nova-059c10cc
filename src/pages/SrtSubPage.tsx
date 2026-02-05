 import { useState, useRef } from "react";
 import { useNavigate } from "react-router-dom";
 import { ArrowLeft, FileType, Upload, Download, Languages, Loader2, Copy, Check } from "lucide-react";
 import { Button } from "@/components/ui/button";
 import { Textarea } from "@/components/ui/textarea";
 import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
 import { useToast } from "@/hooks/use-toast";
 import { useAuthGuard } from "@/hooks/useAuthGuard";
 import { supabase } from "@/integrations/supabase/client";
 import { languages } from "@/data/languages";
 
 const SrtSubPage = () => {
   const navigate = useNavigate();
   const { toast } = useToast();
   const { isLoading: authLoading } = useAuthGuard("srt");
   const fileInputRef = useRef<HTMLInputElement>(null);
 
   const [srtContent, setSrtContent] = useState("");
   const [translatedContent, setTranslatedContent] = useState("");
   const [targetLang, setTargetLang] = useState("my-MM");
   const [isTranslating, setIsTranslating] = useState(false);
   const [copied, setCopied] = useState(false);
   const [fileName, setFileName] = useState("");
 
   const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
     const file = e.target.files?.[0];
     if (!file) return;
 
     if (!file.name.endsWith(".srt")) {
       toast({
         title: "❌ Invalid File",
         description: "SRT ဖိုင်သာ အသုံးပြုနိုင်ပါသည်။",
         variant: "destructive",
       });
       return;
     }
 
     setFileName(file.name);
     const reader = new FileReader();
     reader.onload = (event) => {
       const content = event.target?.result as string;
       setSrtContent(content);
       setTranslatedContent("");
     };
     reader.readAsText(file);
   };
 
   const handleTranslate = async () => {
     if (!srtContent.trim()) {
       toast({
         title: "⚠️ No Content",
         description: "SRT ဖိုင်တင်ပါ သို့မဟုတ် စာသားထည့်ပါ။",
         variant: "destructive",
       });
       return;
     }
 
     setIsTranslating(true);
     setTranslatedContent("");
 
     try {
       const targetLangName = languages.find(l => l.code === targetLang)?.name || "Burmese (Myanmar)";
 
       const { data, error } = await supabase.functions.invoke("novel-translate", {
         body: {
           text: srtContent,
           targetLanguage: targetLangName,
           mode: "srt",
         },
       });
 
       if (error) throw error;
 
       if (data?.error) {
         throw new Error(data.error);
       }
 
       setTranslatedContent(data.translatedText || data.translation || "");
       toast({
         title: "✅ ဘာသာပြန်ပြီးပါပြီ",
         description: "SRT subtitle ဘာသာပြန်ခြင်း အောင်မြင်ပါသည်။",
       });
     } catch (err: any) {
       console.error("SRT translation error:", err);
       toast({
         title: "❌ Translation Error",
         description: err.message || "ဘာသာပြန်ရာတွင် အမှားရှိနေပါသည်။",
         variant: "destructive",
       });
     } finally {
       setIsTranslating(false);
     }
   };
 
   const handleCopy = async () => {
     if (!translatedContent) return;
     await navigator.clipboard.writeText(translatedContent);
     setCopied(true);
     toast({ title: "📋 Copied!", description: "Clipboard သို့ ကူးယူပြီးပါပြီ။" });
     setTimeout(() => setCopied(false), 2000);
   };
 
   const handleDownload = () => {
     if (!translatedContent) return;
 
     const blob = new Blob([translatedContent], { type: "text/plain;charset=utf-8" });
     const url = URL.createObjectURL(blob);
     const a = document.createElement("a");
     a.href = url;
     a.download = fileName ? fileName.replace(".srt", `_${targetLang}.srt`) : "translated.srt";
     document.body.appendChild(a);
     a.click();
     document.body.removeChild(a);
     URL.revokeObjectURL(url);
 
     toast({ title: "📥 Downloaded!", description: "SRT ဖိုင် ဒေါင်းလုဒ်ပြီးပါပြီ။" });
   };
 
   if (authLoading) {
     return (
       <div className="min-h-screen premium-background flex items-center justify-center">
         <Loader2 className="w-6 h-6 animate-spin text-primary" />
       </div>
     );
   }
 
   return (
     <div className="min-h-screen premium-background pb-6">
       <div className="premium-rays" />
 
       {/* Header */}
       <header className="px-3 py-2 flex items-center gap-2 relative z-10">
         <Button
           variant="ghost"
           size="icon"
           className="h-7 w-7"
           onClick={() => navigate("/")}
         >
           <ArrowLeft className="h-4 w-4" />
         </Button>
         <div className="flex items-center gap-1.5">
           <div className="w-6 h-6 rounded-md icon-gradient-rose flex items-center justify-center">
             <FileType className="w-3 h-3 text-foreground" />
           </div>
           <h1 className="text-sm font-bold text-foreground">SRT Sub</h1>
         </div>
       </header>
 
       <main className="px-3 space-y-3 relative z-10">
         {/* Upload Section */}
         <div className="p-3 rounded-xl border border-border/30 bg-card/50 backdrop-blur-sm">
           <div className="flex items-center justify-between mb-2">
             <span className="text-2xs font-medium text-muted-foreground">SRT ဖိုင်တင်ရန်</span>
             {fileName && (
               <span className="text-3xs text-primary truncate max-w-[150px]">{fileName}</span>
             )}
           </div>
           <input
             ref={fileInputRef}
             type="file"
             accept=".srt"
             onChange={handleFileUpload}
             className="hidden"
           />
           <Button
             variant="outline"
             className="w-full h-16 border-dashed border-2 hover:bg-primary/5"
             onClick={() => fileInputRef.current?.click()}
           >
             <div className="flex flex-col items-center gap-1">
               <Upload className="w-5 h-5 text-primary" />
               <span className="text-2xs text-muted-foreground">Click to upload .srt file</span>
             </div>
           </Button>
         </div>
 
         {/* Original SRT Content */}
         <div className="p-3 rounded-xl border border-border/30 bg-card/50 backdrop-blur-sm">
           <span className="text-2xs font-medium text-muted-foreground mb-2 block">Original SRT</span>
           <Textarea
             value={srtContent}
             onChange={(e) => setSrtContent(e.target.value)}
             placeholder="SRT content ထည့်ပါ သို့မဟုတ် ဖိုင်တင်ပါ..."
             className="min-h-[120px] text-xs bg-secondary/30 border-border/20 resize-none"
           />
         </div>
 
         {/* Language & Translate */}
         <div className="flex gap-2">
           <Select value={targetLang} onValueChange={setTargetLang}>
             <SelectTrigger className="flex-1 h-9 text-xs bg-card/50 border-border/30">
               <Languages className="w-3.5 h-3.5 mr-1.5 text-primary" />
               <SelectValue placeholder="ဘာသာစကား" />
             </SelectTrigger>
             <SelectContent>
               {languages.map((lang) => (
                 <SelectItem key={lang.code} value={lang.code} className="text-xs">
                   {lang.nativeName} - {lang.name}
                 </SelectItem>
               ))}
             </SelectContent>
           </Select>
 
           <Button
             onClick={handleTranslate}
             disabled={isTranslating || !srtContent.trim()}
             className="flex-1 h-9 text-xs"
           >
             {isTranslating ? (
               <>
                 <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                 ဘာသာပြန်နေသည်...
               </>
             ) : (
               <>
                 <Languages className="w-3.5 h-3.5 mr-1.5" />
                 ဘာသာပြန်ရန်
               </>
             )}
           </Button>
         </div>
 
         {/* Translated Content */}
         {translatedContent && (
           <div className="p-3 rounded-xl border border-primary/30 bg-primary/5 backdrop-blur-sm">
             <div className="flex items-center justify-between mb-2">
               <span className="text-2xs font-medium text-primary">Translated SRT</span>
               <div className="flex gap-1">
                 <Button
                   variant="ghost"
                   size="icon"
                   className="h-6 w-6"
                   onClick={handleCopy}
                 >
                   {copied ? (
                     <Check className="w-3 h-3 text-primary" />
                   ) : (
                     <Copy className="w-3 h-3" />
                   )}
                 </Button>
                 <Button
                   variant="ghost"
                   size="icon"
                   className="h-6 w-6"
                   onClick={handleDownload}
                 >
                   <Download className="w-3 h-3" />
                 </Button>
               </div>
             </div>
             <Textarea
               value={translatedContent}
               readOnly
               className="min-h-[150px] text-xs bg-secondary/30 border-border/20 resize-none"
             />
           </div>
         )}
       </main>
     </div>
   );
 };
 
 export default SrtSubPage;