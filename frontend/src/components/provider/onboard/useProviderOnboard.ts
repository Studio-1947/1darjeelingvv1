import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api, { createPaymentOrder, completeMockPayment, payWithRazorpay } from '@/lib/api';
import { useAuth } from '@/context/AuthContext';
import { uploadImage, uploadImages } from '@/lib/uploadImage';

/**
 * All state and side effects for provider onboarding: the multi-step form,
 * image uploads, submission, and the ₹99 registration payment flow. The step
 * screens are pure layout over the object this hook returns.
 */
export function useProviderOnboard() {
  const { user, refresh } = useAuth();
  const nav = useNavigate();

  const [step, setStep] = useState(1);
  const [form, setForm] = useState({
    business_name: '',
    business_type: 'homestay',
    description: '',
    location: '',
    contact_phone: '',
    price_from: '',
    image_url: '',
    host_name: '',
    host_bio: '',
    languages: 'Nepali, Hindi, English',
    host_avatar: '',
    address: '',
  });
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [payModal, setPayModal] = useState(null);
  const [confirm, setConfirm] = useState(null);

  const [selectedAmenities, setSelectedAmenities] = useState<string[]>([]);
  const [selectedTags, setSelectedTags] = useState<string[]>([]);

  // Driver & Host profile fields
  const [carModel, setCarModel] = useState('');
  const [gender, setGender] = useState<'male' | 'female' | 'other'>('male');
  const [vehicleType, setVehicleType] = useState('');
  const [routes, setRoutes] = useState<string[]>([]);

  // Extra photos - only one gallery exists per business type
  // (driver trips, or cafe/shop interiors; homestays add theirs post-launch).
  const [gallery, setGallery] = useState<string[]>([]);

  const [uploading, setUploading] = useState(false);
  const [uploadingHostPic, setUploadingHostPic] = useState(false);
  const [uploadingGallery, setUploadingGallery] = useState(false);

  useEffect(() => {
    if (!user) nav('/login');
  }, [user, nav]);

  const update = (patch: Partial<typeof form>) => setForm((prev) => ({ ...prev, ...patch }));

  const uploadTo = (field: 'image_url' | 'host_avatar', setFlag: (b: boolean) => void) =>
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      setFlag(true);
      setMsg('');
      try {
        const url = await uploadImage(file);
        setForm((prev) => ({ ...prev, [field]: url }));
      } catch (err) {
        setMsg(typeof err === 'string' ? err : 'Upload failed');
      } finally {
        setFlag(false);
      }
    };

  const handleCoverUpload = uploadTo('image_url', setUploading);
  const handleHostAvatarUpload = uploadTo('host_avatar', setUploadingHostPic);

  const handleGalleryUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    setUploadingGallery(true);
    setMsg('');
    try {
      const urls = await uploadImages(files);
      setGallery((prev) => [...prev, ...urls]);
    } catch (err) {
      setMsg(typeof err === 'string' ? err : 'Upload failed');
    } finally {
      setUploadingGallery(false);
    }
  };

  /** Step 1 → 2, defaulting the host name from the business name. */
  const startDesignStep = () => {
    if (!form.business_name.trim()) {
      setMsg('Business name is required');
      return;
    }
    setMsg('');
    setForm((prev) => ({
      ...prev,
      host_name: prev.host_name || prev.business_name.split(' ')[0] || 'Host',
    }));
    setStep(2);
  };

  const submit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setBusy(true);
    setMsg('');
    const isDriver = form.business_type === 'driver';
    try {
      const { data } = await api.post('/providers/onboard', {
        business_name: form.business_name,
        business_type: form.business_type,
        description: form.description || `Welcome to ${form.business_name}`,
        location: form.location || 'Darjeeling',
        contact_phone: form.contact_phone || user.phone,
        price_from: Number(form.price_from) || 0,
        images: form.image_url ? [form.image_url] : [],
        extras: isDriver
          ? {
              host_avatar: form.host_avatar || '',
              vehicle_type: vehicleType,
              car_model: carModel,
              gender,
              routes,
              images: gallery,
              contact_phone: form.contact_phone || user.phone,
            }
          : (form.business_type === 'cafe' || form.business_type === 'shop')
          ? {
              address: form.address || '',
              gender,
              amenities: selectedAmenities,
              tags: selectedTags,
              images: gallery,
              contact_phone: form.contact_phone || user.phone,
            }
          : {
              host_name: form.host_name || form.business_name.split(' ')[0] || 'Host',
              host_bio: form.host_bio || 'Your local host welcomes you to Darjeeling.',
              languages: form.languages.split(',').map((s) => s.trim()).filter(Boolean),
              gender,
              contact_phone: form.contact_phone || user.phone,
              host_avatar: form.host_avatar || '',
              address: form.address || '',
              amenities: selectedAmenities,
              tags: selectedTags,
            },
      });
      const providerId = data.provider.id;
      const orderRes = await createPaymentOrder({ flow: 'provider_registration', reference_id: providerId });
      if (orderRes.mock) {
        setPayModal({
          amount: orderRes.amount,
          order: orderRes.order,
          description: 'one-time registration',
          providerId,
        });
      } else {
        await payWithRazorpay({
          order: orderRes.order,
          key_id: orderRes.key_id,
          flow: 'provider_registration',
          reference_id: providerId,
          description: '₹99 one-time provider registration',
          prefill: { contact: user.phone, name: user.name },
        });
        await refresh();
        nav('/provider/dashboard');
      }
    } catch (e: any) {
      setMsg(e?.response?.data?.detail || e.message || 'Failed');
    } finally {
      setBusy(false);
    }
  };

  const finishMockPayment = async () => {
    if (!payModal) return;
    const res = await completeMockPayment({
      order_id: payModal.order.id,
      flow: 'provider_registration',
      reference_id: payModal.providerId,
    });
    setPayModal(null);
    await refresh();
    setConfirm({ open: true, data: res.record });
  };

  return {
    nav,
    step, setStep,
    form, update,
    busy, msg, setMsg,
    payModal, setPayModal,
    confirm, setConfirm,
    selectedAmenities, setSelectedAmenities,
    selectedTags, setSelectedTags,
    carModel, setCarModel,
    gender, setGender,
    vehicleType, setVehicleType,
    routes, setRoutes,
    gallery, setGallery,
    uploading, uploadingHostPic, uploadingGallery,
    handleCoverUpload, handleHostAvatarUpload, handleGalleryUpload,
    startDesignStep, submit, finishMockPayment,
  };
}

export type OnboardState = ReturnType<typeof useProviderOnboard>;
