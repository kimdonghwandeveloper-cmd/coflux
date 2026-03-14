import { invoke } from "@tauri-apps/api/core";
import { z } from "zod";

// Zod schemas for IPC validation as per PM's TS App RULES
export const SdpResponseSchema = z.string().min(10);
export const GenericResponseSchema = z.boolean();

export const webrtcClient = {
  generateOffer: async (): Promise<string> => {
    const raw = await invoke<string>("generate_offer");
    return SdpResponseSchema.parse(raw);
  },
  
  acceptOffer: async (offerSdp: string): Promise<string> => {
    const raw = await invoke<string>("accept_offer", { offerSdp });
    return SdpResponseSchema.parse(raw);
  },
  
  acceptAnswer: async (answerSdp: string): Promise<boolean> => {
    await invoke("accept_answer", { answerSdp });
    return true;
  },

  readClipboardSdp: async (): Promise<string> => {
    const raw = await invoke<string>("read_clipboard_sdp");
    return SdpResponseSchema.parse(raw);
  },

  sendMessage: async (msg: string): Promise<void> => {
    await invoke("send_message", { msg });
  },

  getUserStatus: async (): Promise<string> => {
    return await invoke<string>("get_user_status");
  },

  closeConnection: async (): Promise<void> => {
    await invoke("close_connection");
  }
};
