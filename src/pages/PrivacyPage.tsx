import { ArrowLeft } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useState } from "react";

const PrivacyPage = () => {
  const navigate = useNavigate();
  const [lang, setLang] = useState<'en' | 'my'>('en');

  const content = {
    en: {
      title: "PRIVACY POLICY",
      updated: "Last Updated: December 2025",
      sections: [
        {
          title: "1. Information We Collect",
          text: "Transcript Master AI is designed with a 'privacy-first' approach. We do not require users to create an account or provide personal identifiers like emails. The only data processed includes media files you upload for transcription (processed in-memory) and text input you enter for translation or generation."
        },
        {
          title: "2. How We Process Data",
          text: "We utilize the Google Gemini API for all AI-related tasks. When you upload a file or enter text: Data is transmitted via an encrypted SSL/TLS connection. Processing happens in volatile memory and is NOT used to train future AI models without explicit enterprise consent. Once the output is generated, the temporary data on the server is discarded."
        },
        {
          title: "3. Cookies and Local Storage",
          text: "We do not use tracking cookies or third-party marketing trackers. We only use local browser storage (localStorage) to save your transcription and translation history so you can retrieve it later without re-uploading files. This data never leaves your device unless you manually interact with the AI tools."
        },
        {
          title: "4. Data Security",
          text: "We implement industry-standard security measures to protect your information. However, please remember that no method of transmission over the internet is 100% secure. Users are advised not to process highly sensitive or confidential government information."
        }
      ]
    },
    my: {
      title: "ကိုယ်ရေးလုံခြုံမှု မူဝါဒ",
      updated: "နောက်ဆုံးပြင်ဆင်ချက်: ဒီဇင်ဘာ ၂၀၂၅",
      sections: [
        {
          title: "၁. ကျွန်ုပ်တို့ စုဆောင်းသော အချက်အလက်များ",
          text: "Transcript Master AI သည် 'ကိုယ်ရေးလုံခြုံမှု ဦးစားပေး' ချဉ်းကပ်မှုဖြင့် ဒီဇိုင်းထုတ်ထားပါသည်။ အသုံးပြုသူများအား အကောင့်ဖန်တီးရန် သို့မဟုတ် အီးမေးလ်ကဲ့သို့ ကိုယ်ရေးအချက်အလက်များ ပေးရန် မလိုအပ်ပါ။"
        },
        {
          title: "၂. ဒေတာ လုပ်ဆောင်ပုံ",
          text: "AI နှင့်ဆိုင်သော လုပ်ငန်းများအားလုံးအတွက် Google Gemini API ကို အသုံးပြုပါသည်။ ဖိုင်တင်သောအခါ သို့မဟုတ် စာသားထည့်သောအခါ: ဒေတာကို SSL/TLS ကုဒ်ဝှက်ချိတ်ဆက်မှုမှတဆင့် ပို့လွှတ်ပါသည်။"
        },
        {
          title: "၃. ကွတ်ကီးများနှင့် Local Storage",
          text: "ကျွန်ုပ်တို့သည် tracking cookies သို့မဟုတ် third-party marketing trackers များ အသုံးမပြုပါ။ သင်၏ transcription နှင့် translation history ကို သိမ်းဆည်းရန် local browser storage ကိုသာ အသုံးပြုပါသည်။"
        },
        {
          title: "၄. ဒေတာ လုံခြုံရေး",
          text: "သင်၏ အချက်အလက်များကို ကာကွယ်ရန် စက်မှုလုပ်ငန်း စံနှုန်း လုံခြုံရေး အစီအမံများကို ကျွန်ုပ်တို့ အကောင်အထည်ဖော်ပါသည်။ သို့သော် အင်တာနက်ပေါ်မှ ထုတ်လွှင့်မှုနည်းလမ်းသည် ၁၀၀% လုံခြုံမှု မရှိကြောင်း သတိပြုပါ။"
        }
      ]
    }
  };

  const c = content[lang];

  return (
    <div className="min-h-screen premium-background">
      <div className="premium-rays" />
      
      <header className="px-3 py-2 flex items-center gap-3 relative z-10">
        <button 
          onClick={() => navigate(-1)}
          className="w-7 h-7 rounded-lg bg-secondary/40 border border-border/20 flex items-center justify-center hover:bg-secondary/60 transition-colors"
        >
          <ArrowLeft className="w-3.5 h-3.5 text-foreground" />
        </button>
        <h1 className="text-2xs font-bold tracking-wider">
          <span className="text-foreground">MASTER</span>{" "}
          <span className="text-primary">AI</span>
        </h1>
      </header>

      <main className="px-4 py-6 relative z-10 max-w-2xl mx-auto">
        <div className="flex justify-end mb-4">
          <div className="flex rounded-md overflow-hidden border border-border/30">
            <button
              onClick={() => setLang('en')}
              className={`px-3 py-1 text-3xs font-medium transition-colors ${
                lang === 'en' 
                  ? 'bg-primary text-primary-foreground' 
                  : 'bg-secondary/40 text-muted-foreground hover:text-foreground'
              }`}
            >
              EN
            </button>
            <button
              onClick={() => setLang('my')}
              className={`px-3 py-1 text-3xs font-medium transition-colors ${
                lang === 'my' 
                  ? 'bg-primary text-primary-foreground' 
                  : 'bg-secondary/40 text-muted-foreground hover:text-foreground'
              }`}
            >
              MY
            </button>
          </div>
        </div>

        <div className="text-center mb-8">
          <h1 className="text-xl font-bold text-foreground tracking-widest mb-2">
            {c.title}
          </h1>
          <p className="text-3xs text-muted-foreground tracking-widest uppercase">
            {c.updated}
          </p>
        </div>

        <div className="space-y-6">
          {c.sections.map((section, idx) => (
            <section key={idx} className="space-y-3">
              <h2 className="text-sm font-bold text-primary border-l-2 border-primary pl-3">
                {section.title}
              </h2>
              <p className="text-2xs text-muted-foreground leading-relaxed">
                {section.text}
              </p>
            </section>
          ))}
        </div>
      </main>
    </div>
  );
};

export default PrivacyPage;
