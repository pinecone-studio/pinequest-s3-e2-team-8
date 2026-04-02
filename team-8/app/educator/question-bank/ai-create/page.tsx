import React from 'react';
import { Sparkles, ChevronDown } from 'lucide-react';
import { Textarea } from '@/components/ui/textarea';

export default function AiCreate() {
  return (
    <div className="min-h-screen ">
      <h1 className="text-[20px] font-medium mb-7">AI асуулт үүсгэх</h1>
      
      <div className="flex gap-4 rounded-lg  bg-white p-4">
        {/* Left Sidebar - Configuration */}
        <div className=" flex flex-col gap-4">
          
          {/* Top Selection Box */}
          <div className="bg-white rounded-xl p-4 border border-gray-100 shadow-sm space-y-6">
            <div>
              <label className="text-[14x] font-medium  mb-2 block">Хичээлийн нэр</label>
              <div className="relative">
                <select className="w-full py-2 px-3 bg-gray-50 border border-gray-200 rounded-lg appearance-none focus:outline-none focus:ring-2 focus:ring-blue-500/20">
                  <option>Иргэний боловсрол</option>
                </select>
                <ChevronDown className="absolute right-3 top-3 w-4 h-4 text-gray-400" />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-[14x] font-medium  mb-2 block">Асуултын тоо</label>
                <div className="relative">
                  <select className="w-full py-2 px-3 bg-gray-50 border border-gray-200 rounded-lg appearance-none focus:outline-none">
                    <option>10</option>
                  </select>
                  <ChevronDown className="absolute right-3 top-3 w-4 h-4 text-gray-400" />
                </div>
              </div>
              <div>
                <label className="text-[14x] font-medium  mb-2 block">Хүндийн зэрэг</label>
                <div className="relative">
                  <select className="w-full py-2 px-3 bg-gray-50 border border-gray-200 rounded-lg appearance-none focus:outline-none">
                    <option>Дунд</option>
                  </select>
                  <ChevronDown className="absolute right-3 top-3 w-4 h-4 text-gray-400" />
                </div>
              </div>
            </div>
          </div>

          {/* Bottom Selection Box */}
          <div className="bg-white p-6 rounded-xl border border-gray-100 shadow-sm space-y-4">
            <div>
              <label className="text-[14x] font-medium  mb-2 block">Төрөл</label>
              <div className="relative">
                <select className="w-full py-2 px-3 bg-gray-50 border border-gray-200 rounded-lg appearance-none focus:outline-none">
                  <option>Олон сонголттой</option>
                </select>
                <ChevronDown className="absolute right-3 top-3 w-4 h-4 text-gray-400" />
              </div>
            </div>

            <div>
              <label className="text-[14x] font-medium  mb-2 block">Промт/ Нэмэлт заавар</label>
              <Textarea
                placeholder="Мессежээ энд бичнэ үү."
                className="w-84.5 h-34.5  px-4 py-2 bg-gray-50 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 resize-none"
              />
            </div>
          </div>

          {/* Action Button */}
          <button className="flex items-center justify-center gap-2 w-max px-6 py-2.5 bg-[#ECF1F9] text-[#4891F1] font-semibold rounded-lg hover:bg-blue-100 transition-colors">
            AI-аар үүсгэх
            <Sparkles className="w-4 h-4 fill-current" />
          </button>
        </div>

        {/* Right Main Content - Preview Area */}
        <div className="flex-1 bg-[#F1F5F980] rounded-2xl border border-gray-100 shadow-sm py-8 px-10 relative min-h-178">
          {/* Tooltip/Hint */}
          <div className="absolute top-8 right-8">
            <div className="bg-black text-white text-[13px] py-2 px-6 rounded-full flex items-center gap-2">
              Энэхүү хичээлийн сэдэвтэй асуултууд үүсгэ.
            </div>
          </div>

          {/* Content Placeholder */}
          <div className="mt-12">
            <h2 className="text-lg font-bold text-gray-800">SmartExam.v2.0</h2>
            <p className="text-[14x] text-gray-400 mt-1">Таны промтыг уншиж байна.</p>
          </div>
        </div>
      </div>
    </div>
  );
}