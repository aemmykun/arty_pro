export interface PMSAdapter {
  updateRoomStatus(
    apiKey: string,
    roomNumber: string,
    status: "DIRTY" | "IN_PROGRESS" | "CLEAN" | "INSPECTED"
  ): Promise<boolean>;
}

const operaAdapter: PMSAdapter = {
  updateRoomStatus: async (_apiKey, roomNumber, status) => {
    console.log(`[Opera] Updating room ${roomNumber} to ${status}`);
    return true;
  }
};

const mewsAdapter: PMSAdapter = {
  updateRoomStatus: async (_apiKey, roomNumber, status) => {
    console.log(`[Mews] Updating room ${roomNumber} to ${status}`);
    return true;
  }
};

const rmsCloudAdapter: PMSAdapter = {
  updateRoomStatus: async (_apiKey, roomNumber, status) => {
    console.log(`[RMSCloud] Updating room ${roomNumber} to ${status}`);
    return true;
  }
};

export const getAdapter = (adapterName: string): PMSAdapter => {
  switch (adapterName.toLowerCase()) {
    case "opera":
      return operaAdapter;
    case "mews":
      return mewsAdapter;
    case "rmscloud":
    case "rms":
      return rmsCloudAdapter;
    default:
      throw new Error(`PMS adapter not supported: ${adapterName}`);
  }
};
